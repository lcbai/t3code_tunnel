import {
  isQoderCnCommand,
  ProviderDriverKind,
  ProviderInstanceId,
  resolveProviderInstanceEnabled,
  type ServerSettings,
} from "@t3tools/contracts";
import { AcpRegistrySettings } from "@t3tools/provider-acp-registry/settings";
import {
  enrichProviderSnapshotWithVersionAdvisory,
  resolveLatestProviderVersion,
} from "@t3tools/provider-core/server/maintenanceResolver";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { forkParked } from "../serverActivation.ts";
import * as ServerSettingsService from "../serverSettings.ts";
import * as ProviderRegistry from "./ProviderRegistry.ts";
import * as ProviderMaintenanceRunner from "./providerMaintenanceRunner.ts";

const ACP_REGISTRY = ProviderDriverKind.make("acpRegistry");
const decodeAcpSettings = Schema.decodeUnknownOption(AcpRegistrySettings);

function optedInInstances(settings: ServerSettings) {
  if (!settings.enableProviderUpdateChecks) return [];
  return Object.entries(settings.providerInstances).flatMap(([id, instance]) => {
    if (instance.driver !== ACP_REGISTRY || !resolveProviderInstanceEnabled(instance)) return [];
    const config = decodeAcpSettings(instance.config ?? {});
    if (Option.isNone(config)) return [];
    const { source, autoUpdate, commandPath } = config.value;
    return source === "local" && autoUpdate && isQoderCnCommand(commandPath)
      ? [{ instanceId: ProviderInstanceId.make(id), commandPath }]
      : [];
  });
}

export const makeAutomaticProviderUpdateCheck = Effect.fn("AutomaticProviderUpdates.makeCheck")(
  function* () {
    const settings = yield* ServerSettingsService.ServerSettingsService;
    const providers = yield* ProviderRegistry.ProviderRegistry;
    const maintenance = yield* ProviderMaintenanceRunner.ProviderMaintenanceRunner;
    const attemptedVersions = new Map<string, string>();

    return Effect.gen(function* () {
      for (const { instanceId, commandPath } of optedInInstances(yield* settings.getSettings)) {
        const capabilities = yield* providers.getProviderMaintenanceCapabilitiesForInstance(
          instanceId,
          ACP_REGISTRY,
          { fresh: true },
        );
        if (!capabilities.update) continue;
        const { lockKey } = capabilities.update;
        const latestVersion = yield* resolveLatestProviderVersion(capabilities);
        if (!latestVersion || attemptedVersions.get(lockKey) === latestVersion) continue;
        const refreshed = yield* providers.refreshInstance(instanceId);
        const snapshot = refreshed.find((candidate) => candidate.instanceId === instanceId);
        if (!snapshot?.enabled || !snapshot.installed || snapshot.status === "error") continue;
        if (snapshot.updateState?.status === "queued" || snapshot.updateState?.status === "running")
          continue;
        const { versionAdvisory } = yield* enrichProviderSnapshotWithVersionAdvisory(
          snapshot,
          capabilities,
        );
        if (versionAdvisory.status !== "behind_latest" || !versionAdvisory.canUpdate) continue;
        if (
          !optedInInstances(yield* settings.getSettings).some(
            (entry) => entry.instanceId === instanceId && entry.commandPath === commandPath,
          )
        )
          continue;
        attemptedVersions.set(lockKey, latestVersion);
        yield* maintenance.updateProvider({ provider: ACP_REGISTRY, instanceId }).pipe(
          Effect.catch((error) =>
            Effect.logWarning("Automatic provider update did not start", {
              provider: ACP_REGISTRY,
              instanceId,
              reason: error.reason,
            }),
          ),
        );
      }
    });
  },
);

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const settings = yield* ServerSettingsService.ServerSettingsService;
    const check = yield* makeAutomaticProviderUpdateCheck();
    const optedInChanges = (yield* settings.subscribeChanges).pipe(
      Stream.map((settings) => JSON.stringify(optedInInstances(settings))),
      Stream.changes,
    );
    yield* forkParked(
      Stream.merge(Stream.tick("1 hour"), optedInChanges).pipe(
        Stream.runForEach(() => check.pipe(Effect.ignoreCause({ log: true }))),
      ),
    );
  }),
);
