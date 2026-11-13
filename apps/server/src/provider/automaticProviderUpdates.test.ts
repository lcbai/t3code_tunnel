import { assert, it } from "@effect/vitest";
import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import * as ProviderLatestVersions from "@t3tools/provider-core/server/ProviderLatestVersions";
import { makeProviderMaintenanceCapabilities } from "@t3tools/provider-core/server/maintenanceResolver";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import { HttpClient } from "effect/http";

import { ServerSettingsService } from "../serverSettings.ts";
import { makeAutomaticProviderUpdateCheck } from "./automaticProviderUpdates.ts";
import { ProviderMaintenanceRunner } from "./providerMaintenanceRunner.ts";
import { ProviderRegistry } from "./ProviderRegistry.ts";

const driver = ProviderDriverKind.make("acpRegistry");
const firstInstanceId = ProviderInstanceId.make("qoder-first");
const secondInstanceId = ProviderInstanceId.make("qoder-second");
const qoderConfig = {
  source: "local",
  commandPath: "/opt/tools/qoderclicn",
  commandArgs: ["--acp"],
};
const firstProvider: ServerProvider = {
  driver,
  instanceId: firstInstanceId,
  enabled: true,
  installed: true,
  status: "ready",
  auth: { status: "authenticated" },
  version: "1.0.0",
  checkedAt: "2026-04-10T00:00:00.000Z",
  models: [],
  slashCommands: [],
  skills: [],
};
const providers = [firstProvider, { ...firstProvider, instanceId: secondInstanceId }];
const layerNoHttp = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make(() => Effect.die("Unexpected HTTP request")),
);

it.effect(
  "attempts the same Qoder CN release only once for instances sharing an installation",
  () =>
    Effect.gen(function* () {
      const calls = yield* Ref.make<ReadonlyArray<ProviderInstanceId | undefined>>([]);
      const latestVersion = yield* Ref.make("1.1.0");
      yield* Effect.gen(function* () {
        const check = yield* makeAutomaticProviderUpdateCheck();
        yield* check;
        yield* check;
        assert.deepStrictEqual(yield* Ref.get(calls), [firstInstanceId]);

        yield* Ref.set(latestVersion, "1.2.0");
        yield* check;
        assert.deepStrictEqual(yield* Ref.get(calls), [firstInstanceId, firstInstanceId]);
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            ProviderLatestVersions.layer,
            layerNoHttp,
            ServerSettingsService.layerTest({
              providerInstances: {
                [firstInstanceId]: { driver, config: { ...qoderConfig, autoUpdate: true } },
                [secondInstanceId]: { driver, config: { ...qoderConfig, autoUpdate: true } },
              },
            }),
            Layer.mock(ProviderRegistry)({
              getProviders: Effect.succeed(providers),
              refreshInstance: () => Effect.succeed(providers),
              getProviderMaintenanceCapabilitiesForInstance: () =>
                Ref.get(latestVersion).pipe(
                  Effect.map((latestVersion) =>
                    makeProviderMaintenanceCapabilities({
                      provider: driver,
                      packageName: null,
                      updateExecutable: qoderConfig.commandPath,
                      updateArgs: ["update"],
                      updateLockKey: "test-qoder-installation",
                      latestVersion,
                    }),
                  ),
                ),
            }),
            Layer.succeed(ProviderMaintenanceRunner, {
              updateProvider: (target) =>
                Ref.update(calls, (previous) => [
                  ...previous,
                  typeof target === "string" ? undefined : target.instanceId,
                ]).pipe(Effect.as({ providers })),
            }),
          ),
        ),
      );
    }),
);

it.effect.each([
  {
    name: "provider update checks are disabled",
    enableProviderUpdateChecks: false,
    autoUpdate: true,
  },
  {
    name: "the instance has not opted in",
    enableProviderUpdateChecks: true,
    autoUpdate: undefined,
  },
])("skips an automatic Qoder CN update when $name", ({ enableProviderUpdateChecks, autoUpdate }) =>
  makeAutomaticProviderUpdateCheck().pipe(
    Effect.flatten,
    Effect.provide(
      Layer.mergeAll(
        ProviderLatestVersions.layer,
        layerNoHttp,
        ServerSettingsService.layerTest({
          enableProviderUpdateChecks,
          providerInstances: {
            [firstInstanceId]: {
              driver,
              config: {
                ...qoderConfig,
                ...(autoUpdate === undefined ? {} : { autoUpdate }),
              },
            },
          },
        }),
        Layer.mock(ProviderRegistry)({
          getProviders: Effect.succeed(providers),
        }),
        Layer.mock(ProviderMaintenanceRunner)({}),
      ),
    ),
  ),
);
