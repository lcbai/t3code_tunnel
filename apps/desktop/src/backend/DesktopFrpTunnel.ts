import {
  DesktopFrpTunnelConfig,
  type AdvertisedEndpoint,
  type DesktopFrpTunnelState,
} from "@t3tools/contracts";
import { createAdvertisedEndpoint } from "@t3tools/shared/advertisedEndpoint";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Redacted from "effect/Redacted";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as HttpClient from "effect/http/HttpClient";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import * as DesktopConfig from "../app/DesktopConfig.ts";
import * as DesktopManagedPolicy from "../app/DesktopManagedPolicy.ts";
import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronSafeStorage from "../electron/ElectronSafeStorage.ts";

const disabled: DesktopFrpTunnelState = { status: "disabled", url: null, message: null };
const environmentPath = "/.well-known/t3/environment";
const decodeEnvironmentId = Schema.decodeUnknownEffect(
  Schema.Struct({ environmentId: Schema.String }),
);
const configJson = Schema.fromJsonString(DesktopFrpTunnelConfig);
const decodeConfig = Schema.decodeUnknownEffect(configJson);
const encodeConfig = Schema.encodeEffect(configJson);
const encodeToken = Schema.encodeEffect(Schema.fromJsonString(Schema.String));

class DesktopFrpTunnelError extends Schema.TaggedError<
  DesktopFrpTunnelError,
  { readonly brand: unique symbol }
>()("DesktopFrpTunnelError", { message: Schema.String }) {}

const failure = (message: string) => new DesktopFrpTunnelError({ message });
const isTunnelError = Schema.is(DesktopFrpTunnelError);

export class DesktopFrpTunnel extends Context.Service<
  DesktopFrpTunnel,
  {
    readonly restore: (directory: string, localUrl: URL) => Effect.Effect<void>;
    readonly stop: Effect.Effect<void>;
    readonly state: Effect.Effect<DesktopFrpTunnelState>;
    readonly endpoint: Effect.Effect<AdvertisedEndpoint | null>;
    readonly configure: (
      input: DesktopFrpTunnelConfig | null,
    ) => Effect.Effect<DesktopFrpTunnelState, DesktopFrpTunnelError>;
  }
>()("@t3tools/desktop/backend/DesktopFrpTunnel") {}

const normalizeFrpConfig = (input: DesktopFrpTunnelConfig): DesktopFrpTunnelConfig => {
  const url = new URL(input.url.trim());
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.port === "0" ||
    !/^[a-z\d.-]+$/u.test(url.hostname)
  ) {
    throw new Error("请输入 HTTPS 服务器域名，可包含端口。");
  }
  const token = input.token.trim();
  if (!/^[!-~]{1,512}$/u.test(token)) {
    throw new Error("请输入服务器提供的密钥。密钥不可包含空格或换行。");
  }
  return { url: url.origin, token };
};

function frpClientToml(publicUrl: URL, localUrl: URL): string {
  return `serverAddr = ${JSON.stringify(publicUrl.hostname)}
serverPort = ${publicUrl.port || "443"}
loginFailExit = false
auth.method = "token"
auth.token = {{ .Envs.T3CODE_FRP_TOKEN }}
transport.protocol = "wss"
transport.tls.useSystemCa = true

[[proxies]]
name = ${JSON.stringify(`t3code-${publicUrl.hostname}`)}
type = "http"
localIP = ${JSON.stringify(localUrl.hostname)}
localPort = ${localUrl.port}
customDomains = [${JSON.stringify(publicUrl.hostname)}]
requestHeaders.set.x-forwarded-proto = "https"
`;
}

const validateConfig = (input: DesktopFrpTunnelConfig) =>
  Effect.try({
    try: () => normalizeFrpConfig(input),
    catch: (error) =>
      failure(
        error instanceof TypeError
          ? "请输入有效的 HTTPS 服务器网址。"
          : error instanceof Error
            ? error.message
            : "穿透服务器配置无效。",
      ),
  });

const make = Effect.gen(function* () {
  const scope = yield* Scope.Scope;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const safeStorage = yield* ElectronSafeStorage.ElectronSafeStorage;
  const app = yield* ElectronApp.ElectronApp;
  const managedPolicy = yield* DesktopManagedPolicy.DesktopManagedPolicy;
  const platform = yield* HostProcess.Platform;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const http = yield* HttpClient.HttpClient;
  const binaryOverride = yield* DesktopConfig.trimmedString("T3CODE_FRPC_PATH");
  const state = yield* Ref.make(disabled);
  const running = yield* Ref.make<Fiber.Fiber<never> | null>(null);
  const target = yield* Ref.make<{ readonly file: string; readonly localUrl: URL } | null>(null);
  const permit = yield* Semaphore.make(1);

  const remoteAllowed = managedPolicy.read.pipe(
    Effect.map((policy) => policy?.document.limits?.clients?.includes("remote") ?? true),
    Effect.orElseSucceed(() => false),
  );

  const stopChild = Ref.getAndSet(running, null).pipe(
    Effect.flatMap((fiber) => (fiber ? Fiber.interrupt(fiber) : Effect.void)),
  );

  const getEnvironmentId = (origin: URL) =>
    http.get(new URL(environmentPath, origin)).pipe(
      Effect.flatMap((response) =>
        response.status === 200 ? response.json : Effect.succeed(null),
      ),
      Effect.flatMap(decodeEnvironmentId),
      Effect.map(({ environmentId }) => environmentId),
      Effect.timeoutOption("4 seconds"),
      Effect.orElseSucceed(() => Option.none()),
    );

  const runClient = Effect.fn("desktop.frp.runClient")(function* (
    config: DesktopFrpTunnelConfig,
    localUrl: URL,
  ) {
    const executable = platform === "win32" ? "frpc.exe" : "frpc";
    const metadata = yield* app.metadata;
    const command = Option.getOrElse(binaryOverride, () =>
      metadata.isPackaged ? path.join(metadata.resourcesPath, "frp", executable) : executable,
    );
    const publicUrl = new URL(config.url);
    const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3code-frp-" });
    const configFile = path.join(directory, "frpc.toml");
    yield* fileSystem.writeFileString(configFile, frpClientToml(publicUrl, localUrl));
    const process = yield* spawner.spawn(
      ChildProcess.make(command, ["-c", configFile], {
        env: { T3CODE_FRP_TOKEN: Redacted.make(yield* encodeToken(config.token)) },
        extendEnv: true,
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
        windowsHide: true,
        forceKillAfter: "2 seconds",
      }),
    );
    const probe = Effect.gen(function* () {
      const localId = yield* getEnvironmentId(localUrl);
      const publicId = Option.isSome(localId) ? yield* getEnvironmentId(publicUrl) : Option.none();
      const hasBothIds = Option.isSome(localId) && Option.isSome(publicId);
      const connected = hasBothIds && localId.value === publicId.value;
      yield* Ref.set(
        state,
        connected
          ? { status: "connected", url: config.url, message: null }
          : {
              status: hasBothIds ? "error" : "connecting",
              url: config.url,
              message: hasBothIds
                ? "此域名已连接到另一个 T3 Code 环境。"
                : "正在等待穿透服务器。请确认网址、密钥和服务器配置。",
            },
      );
      yield* Effect.sleep(connected ? "15 seconds" : "3 seconds");
    });
    yield* Effect.raceFirst(process.exitCode, Effect.forever(probe));
  }, Effect.scoped);

  const startChild = Effect.fn("desktop.frp.startChild")(function* (
    config: DesktopFrpTunnelConfig,
    localUrl: URL,
  ) {
    yield* Ref.set(state, { status: "connecting", url: config.url, message: null });
    const fiber = yield* Effect.forkIn(
      Effect.forever(
        runClient(config, localUrl).pipe(
          Effect.matchEffect({
            onSuccess: () =>
              Ref.set(state, {
                status: "error",
                url: config.url,
                message: "穿透进程已退出，正在重试。",
              }),
            onFailure: () =>
              Ref.set(state, {
                status: "error",
                url: config.url,
                message: "无法启动 frpc。请检查安装包或 frpc 路径。",
              }),
          }),
          Effect.andThen(Effect.sleep("5 seconds")),
        ),
      ),
      scope,
    );
    yield* Ref.set(running, fiber);
  });

  const restore = Effect.fn("desktop.frp.restore")(function* (directory: string, localUrl: URL) {
    const file = path.join(directory, "frp-tunnel.enc");
    yield* Ref.set(target, { file, localUrl });
    if (!(yield* remoteAllowed)) return;
    yield* Effect.gen(function* () {
      if (!(yield* fileSystem.exists(file))) return;
      const encrypted = yield* fileSystem.readFile(file);
      const saved = yield* safeStorage.decryptString(encrypted);
      const config = yield* decodeConfig(saved).pipe(Effect.flatMap(validateConfig));
      yield* startChild(config, localUrl);
    }).pipe(
      Effect.catch(() =>
        Ref.set(state, {
          status: "error",
          url: null,
          message: "无法读取已保存的穿透配置，请重新输入网址和密钥。",
        }),
      ),
    );
  }, permit.withPermit);

  const configure = Effect.fn("desktop.frp.configure")(function* (
    input: DesktopFrpTunnelConfig | null,
  ) {
    const destination = yield* Ref.get(target);
    if (!destination) return yield* failure("请先启用本机环境。");
    if (input === null) {
      yield* fileSystem
        .remove(destination.file, { force: true })
        .pipe(Effect.mapError(() => failure("无法删除已保存的穿透配置。")));
      yield* stopChild;
      yield* Ref.set(state, disabled);
      return disabled;
    }
    if (!(yield* remoteAllowed)) return yield* failure("当前管理策略禁止远程设备连接。");
    const config = yield* validateConfig(input);
    const temporary = `${destination.file}.tmp`;
    yield* Effect.gen(function* () {
      const encryptionAvailable = yield* safeStorage.isEncryptionAvailable;
      const storageBackend = yield* safeStorage.selectedStorageBackend;
      if (!encryptionAvailable || Option.contains(storageBackend, "basic_text")) {
        return yield* failure("系统安全存储不可用。请解锁系统钥匙串后重试。");
      }
      const serialized = yield* encodeConfig(config);
      const encrypted = yield* safeStorage.encryptString(serialized);
      yield* fileSystem.makeDirectory(path.dirname(destination.file), { recursive: true });
      yield* fileSystem.writeFile(temporary, encrypted, { mode: 0o600 });
      yield* fileSystem.rename(temporary, destination.file);
    }).pipe(
      Effect.mapError((error) => (isTunnelError(error) ? error : failure("无法保存穿透配置。"))),
      Effect.ensuring(fileSystem.remove(temporary, { force: true }).pipe(Effect.ignore)),
    );
    yield* stopChild;
    yield* startChild(config, destination.localUrl);
    return yield* Ref.get(state);
  }, permit.withPermit);

  return DesktopFrpTunnel.of({
    restore,
    stop: permit.withPermit(stopChild),
    configure,
    state: Ref.get(state),
    endpoint: Ref.get(state).pipe(
      Effect.map((current) =>
        current.status === "connected" && current.url
          ? createAdvertisedEndpoint({
              id: `frp:${current.url}`,
              label: "FRP 穿透",
              httpBaseUrl: current.url,
              provider: { id: "frp", label: "FRP", kind: "tunnel", isAddon: false },
              source: "desktop-core",
              reachability: "public",
              hostedHttpsCompatibility: "compatible",
              isDefault: true,
            })
          : null,
      ),
    ),
  });
});

export const layer = Layer.effect(DesktopFrpTunnel, make);
