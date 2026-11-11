import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as SynchronizedRef from "effect/SynchronizedRef";

import * as FileSystem from "effect/FileSystem";
import { HttpClient } from "effect/http";
import { ChildProcessSpawner } from "effect/process";

import * as DesktopBackendConfiguration from "./DesktopBackendConfiguration.ts";
import * as DesktopBackendManager from "./DesktopBackendManager.ts";
import * as DesktopObservability from "../app/DesktopObservability.ts";
import * as DesktopState from "../app/DesktopState.ts";
import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";
import * as DesktopTelemetryPublisher from "../telemetry/DesktopTelemetryPublisher.ts";
import * as DesktopBrowserHost from "../preview/DesktopBrowserHost.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";
import * as DesktopWslEnvironment from "../wsl/DesktopWslEnvironment.ts";
import * as ElectronDialog from "../electron/ElectronDialog.ts";
import * as ElectronApp from "../electron/ElectronApp.ts";

const { logWarning: logBackendPoolWarning } =
  DesktopObservability.makeComponentLogger("desktop-backend-pool");

export type BackendInstanceId = DesktopBackendManager.BackendInstanceId;
export const BackendInstanceId = DesktopBackendManager.BackendInstanceId;
export const PRIMARY_INSTANCE_ID = DesktopBackendManager.PRIMARY_INSTANCE_ID;
export type DesktopBackendInstance = DesktopBackendManager.DesktopBackendInstance;
export type BackendInstanceSpec = DesktopBackendManager.BackendInstanceSpec;

export class DesktopBackendPoolInstanceAlreadyRegisteredError extends Schema.TaggedError<DesktopBackendPoolInstanceAlreadyRegisteredError>()(
  "DesktopBackendPoolInstanceAlreadyRegisteredError",
  {
    id: Schema.String,
  },
) {
  override get message() {
    return `Backend instance "${this.id}" is already registered in the pool.`;
  }
}

export class DesktopBackendPoolCannotUnregisterPrimaryError extends Schema.TaggedError<DesktopBackendPoolCannotUnregisterPrimaryError>()(
  "DesktopBackendPoolCannotUnregisterPrimaryError",
  {},
) {
  override get message() {
    return "Refusing to unregister the primary backend from the pool.";
  }
}

export class DesktopBackendPool extends Context.Service<
  DesktopBackendPool,
  {
    readonly get: (id: BackendInstanceId) => Effect.Effect<Option.Option<DesktopBackendInstance>>;
    readonly list: Effect.Effect<readonly DesktopBackendInstance[]>;
    readonly primary: Effect.Effect<DesktopBackendInstance>;
    readonly register: (
      spec: BackendInstanceSpec,
    ) => Effect.Effect<DesktopBackendInstance, DesktopBackendPoolInstanceAlreadyRegisteredError>;
    readonly unregister: (
      id: BackendInstanceId,
    ) => Effect.Effect<void, DesktopBackendPoolCannotUnregisterPrimaryError>;
  }
>()("@t3tools/desktop/backend/DesktopBackendPool") {}

export type BackendInstanceFactoryRequirements =
  | FileSystem.FileSystem
  | ChildProcessSpawner.ChildProcessSpawner
  | HttpClient.HttpClient
  | DesktopObservability.DesktopBackendOutputLogFactory
  | DesktopTelemetryPublisher.DesktopTelemetryPublisher
  | DesktopBrowserHost.DesktopBrowserHost
  | DesktopWslEnvironment.DesktopWslEnvironment;

interface ActiveRegisteredInstance {
  readonly _tag: "Active";
  readonly instance: DesktopBackendInstance;
  readonly scope: Option.Option<Scope.Closeable>;
}

interface ClosingRegisteredInstance {
  readonly _tag: "Closing";
  readonly done: Deferred.Deferred<void>;
}

type RegisteredInstance = ActiveRegisteredInstance | ClosingRegisteredInstance;

type RegisterAction =
  | { readonly _tag: "Registered"; readonly instance: DesktopBackendInstance }
  | { readonly _tag: "Wait"; readonly done: Deferred.Deferred<void> };

type UnregisterAction =
  | { readonly _tag: "Absent" }
  | { readonly _tag: "Wait"; readonly done: Deferred.Deferred<void> }
  | { readonly _tag: "Close"; readonly entry: ActiveRegisteredInstance };

export const layer = Layer.effect(
  DesktopBackendPool,
  Effect.gen(function* () {
    const configuration = yield* DesktopBackendConfiguration.DesktopBackendConfiguration;
    const desktopWindow = yield* DesktopWindow.DesktopWindow;
    const electronDialog = yield* ElectronDialog.ElectronDialog;
    const electronApp = yield* ElectronApp.ElectronApp;
    const appSettings = yield* DesktopAppSettings.DesktopAppSettings;
    const { primaryBackendStartup } = yield* DesktopState.DesktopState;
    // Parent instance scopes to the pool so shutdown runs stop finalizers before the OS kills backends.
    const layerScope = yield* Scope.Scope;
    const factoryContext = yield* Effect.context<BackendInstanceFactoryRequirements>();

    // Persist fatal Windows fallbacks; transient transport failures must preserve the user's WSL preference.
    const handlePrimaryPreflightFailure = Effect.fn("desktop.backendPool.primaryPreflightFailed")(
      function* (failure: DesktopBackendManager.PreflightFailure) {
        const { reason, fatal } = failure;
        if (!fatal) {
          yield* logBackendPoolWarning(
            "primary WSL preflight retry window exhausted; using Windows for this launch",
            { reason },
          );
          yield* electronDialog.showErrorBox(
            "WSL 后端仍不可用",
            `${reason}\n\nT3 Code 本次将使用 Windows 后端，下次启动时会重试 WSL。`,
          );
          yield* appSettings.applyWslWindowsFallbackInMemory;
          return true;
        }

        yield* logBackendPoolWarning("primary WSL preflight failed; falling back to Windows", {
          reason,
        });
        yield* electronDialog.showErrorBox(
          "WSL 后端无法启动",
          `${reason}\n\n将切换到 Windows 后端以打开 T3 Code。修复 WSL 发行版后，可在「设置 → 共享与访问」中重新启用 WSL 后端。`,
        );
        // Clear wslOnly too so enabling WSL cannot restore a failed mode.
        // Keep the in-memory fallback if persistence fails.
        yield* appSettings.applyWslWindowsFallback.pipe(
          Effect.catch((error) =>
            logBackendPoolWarning(
              "failed to persist Windows fallback after WSL preflight failure",
              {
                error: error.message,
              },
            ).pipe(Effect.andThen(appSettings.applyWslWindowsFallbackInMemory)),
          ),
        );
        return true;
      },
    );

    const primary = yield* DesktopBackendManager.makeBackendInstance({
      id: DesktopBackendManager.PRIMARY_INSTANCE_ID,
      // Resolve lazily: startup loads persisted settings after pool initialization.
      label: configuration.resolvePrimaryLabel,
      configResolve: configuration.resolvePrimary,
      // Absorb window errors so readiness can reset restartAttempt.
      onReady: (httpBaseUrl) =>
        desktopWindow.handleBackendReady(httpBaseUrl).pipe(
          // Only once the main window exists, so the recovery window never closes into nothing.
          Effect.andThen(SubscriptionRef.set(primaryBackendStartup, { _tag: "Ready" })),
          Effect.catch((error) =>
            logBackendPoolWarning("failed to open main window after backend readiness", {
              error: error.message,
            }),
          ),
        ),
      onStartupFailure: (failure) =>
        SubscriptionRef.set(primaryBackendStartup, { _tag: "Failing", ...failure }),
      onShutdown: () => desktopWindow.handleBackendNotReady,
      onPreflightFailed: handlePrimaryPreflightFailure,
      onStateDirOwned: () =>
        electronDialog
          .showErrorBox(
            "此 T3 数据目录不可用",
            "此数据目录正在被另一个 T3 Code 服务器占用，或者已关联到旧版后台服务。请停止该服务器或尝试运行 t3 update。如果旧启动器无法更新，请运行 t3 service uninstall，并按需使用新版 CLI 执行 t3 service install。如果 t3 缺失或版本过旧，可使用 npx t3@latest；每条命令都需通过 --base-dir 指定后台服务的数据目录。随后重新打开 T3 Code。你也可以设置独立的 T3CODE_HOME，再配对到正在运行的服务器。",
          )
          .pipe(Effect.andThen(electronApp.quit)),
    });

    const instancesRef = yield* SynchronizedRef.make<
      ReadonlyMap<BackendInstanceId, RegisteredInstance>
    >(
      new Map([
        [
          DesktopBackendManager.PRIMARY_INSTANCE_ID,
          { _tag: "Active", instance: primary, scope: Option.none() },
        ],
      ]),
    );

    const register: DesktopBackendPool["Service"]["register"] = (spec) =>
      Effect.suspend(() =>
        SynchronizedRef.modifyEffect(
          instancesRef,
          (
            current,
          ): Effect.Effect<
            readonly [RegisterAction, ReadonlyMap<BackendInstanceId, RegisteredInstance>],
            DesktopBackendPoolInstanceAlreadyRegisteredError
          > => {
            const existing = current.get(spec.id);
            if (existing?._tag === "Active") {
              return Effect.fail(
                new DesktopBackendPoolInstanceAlreadyRegisteredError({ id: spec.id }),
              );
            }
            if (existing?._tag === "Closing") {
              return Effect.succeed([
                { _tag: "Wait", done: existing.done } as const,
                current,
              ] as const);
            }
            return Effect.gen(function* () {
              // Provide the child Scope last so the captured pool Scope cannot shadow it and orphan stop/restart finalizers.
              const instanceScope = yield* Scope.fork(layerScope, "sequential");
              const instance = yield* DesktopBackendManager.makeBackendInstance(spec).pipe(
                Scope.provide(instanceScope),
                Effect.provide(factoryContext),
              );
              const next = new Map(current);
              next.set(spec.id, {
                _tag: "Active",
                instance,
                scope: Option.some(instanceScope),
              });
              return [
                { _tag: "Registered", instance } as const,
                next as ReadonlyMap<BackendInstanceId, RegisteredInstance>,
              ] as const;
            });
          },
        ).pipe(
          Effect.flatMap((result) =>
            result._tag === "Registered"
              ? Effect.succeed(result.instance)
              : Deferred.await(result.done).pipe(Effect.andThen(register(spec))),
          ),
        ),
      );

    const unregister: DesktopBackendPool["Service"]["unregister"] = Effect.fn(
      "DesktopBackendPool.unregister",
    )(function* (id) {
      if (id === DesktopBackendManager.PRIMARY_INSTANCE_ID) {
        return yield* new DesktopBackendPoolCannotUnregisterPrimaryError();
      }
      const done = yield* Deferred.make<void>();
      const action = yield* SynchronizedRef.modifyEffect(
        instancesRef,
        (
          current,
        ): Effect.Effect<
          readonly [UnregisterAction, ReadonlyMap<BackendInstanceId, RegisteredInstance>]
        > => {
          const entry = current.get(id);
          if (entry === undefined) {
            return Effect.succeed([{ _tag: "Absent" } as const, current] as const);
          }
          if (entry._tag === "Closing") {
            return Effect.succeed([{ _tag: "Wait", done: entry.done } as const, current] as const);
          }
          const next = new Map(current);
          next.set(id, { _tag: "Closing", done });
          return Effect.succeed([
            { _tag: "Close", entry } as const,
            next as ReadonlyMap<BackendInstanceId, RegisteredInstance>,
          ] as const);
        },
      );

      if (action._tag === "Absent") return;
      if (action._tag === "Wait") {
        yield* Deferred.await(action.done);
        return;
      }

      const finish = SynchronizedRef.modifyEffect(instancesRef, (current) => {
        const closing = current.get(id);
        if (closing?._tag !== "Closing" || closing.done !== done) {
          return Effect.succeed([undefined, current] as const);
        }
        const next = new Map(current);
        next.delete(id);
        return Effect.succeed([
          undefined,
          next as ReadonlyMap<BackendInstanceId, RegisteredInstance>,
        ] as const);
      }).pipe(Effect.andThen(Deferred.succeed(done, undefined)), Effect.asVoid);
      yield* Option.match(action.entry.scope, {
        onNone: () => Effect.void,
        onSome: (scope) => Scope.close(scope, Exit.void).pipe(Effect.ignore),
      }).pipe(Effect.ensuring(finish));
    });

    return DesktopBackendPool.of({
      get: Effect.fn("DesktopBackendPool.get")(function (id) {
        return SynchronizedRef.get(instancesRef).pipe(
          Effect.map((instances) => {
            const entry = instances.get(id);
            return entry?._tag === "Active" ? Option.some(entry.instance) : Option.none();
          }),
        );
      }),
      list: SynchronizedRef.get(instancesRef).pipe(
        Effect.map((instances) =>
          Array.from(instances.values()).flatMap((entry) =>
            entry._tag === "Active" ? [entry.instance] : [],
          ),
        ),
      ),
      primary: Effect.succeed(primary),
      register,
      unregister,
    });
  }),
);

export const layerTest = (
  instances: readonly DesktopBackendInstance[],
): Layer.Layer<DesktopBackendPool> =>
  Layer.effect(
    DesktopBackendPool,
    Effect.gen(function* () {
      if (instances.length === 0) {
        return yield* Effect.die("DesktopBackendPool.layerTest requires at least one instance");
      }
      const byId = new Map<BackendInstanceId, DesktopBackendInstance>(
        instances.map((instance) => [instance.id, instance] as const),
      );
      const primary = instances[0]!;
      return DesktopBackendPool.of({
        get: Effect.fn("DesktopBackendPool.get")(function (id) {
          return Effect.succeed(Option.fromNullishOr(byId.get(id)));
        }),
        list: Effect.succeed(Array.from(byId.values())),
        primary: Effect.succeed(primary),
        register: Effect.fn("DesktopBackendPool.register")(function () {
          return Effect.die("DesktopBackendPool.layerTest does not support register");
        }),
        unregister: Effect.fn("DesktopBackendPool.unregister")(function () {
          return Effect.die("DesktopBackendPool.layerTest does not support unregister");
        }),
      });
    }),
  );
