import { isQoderCnCommand, ProviderDriverKind } from "@t3tools/contracts";
import { collectUint8StreamText } from "@t3tools/provider-core/server/collectStreamText";
import {
  makePackageManagedProviderMaintenanceResolver,
  makeProviderMaintenanceCapabilities,
  normalizeCommandPath,
  resolveProviderMaintenanceCapabilitiesEffect,
} from "@t3tools/provider-core/server/maintenanceResolver";
import { providerProbeEnvironment } from "@t3tools/provider-core/server/snapshotProbe";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import type { AcpRegistrySettings } from "../settings.ts";
import type { ResolvedAcpRegistryAgent } from "./AcpRegistrySupport.ts";

const DRIVER_KIND = ProviderDriverKind.make("acpRegistry");
const LATEST_MANIFEST = "https://static.qoder.com.cn/qoder-cli-cn/channels/manifest.json";
const CLI_VERSION = /^v?(\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?)(?:\+[a-z0-9.-]+)?$/i;
const Manifest = Schema.Struct({ latest: Schema.String.check(Schema.isPattern(CLI_VERSION)) });
const packageMaintenance = makePackageManagedProviderMaintenanceResolver({
  provider: DRIVER_KIND,
  npmPackageName: "@qodercn-ai/qoderclicn",
  nativeUpdate: null,
});

const QODER_UPDATE_ENV_KEYS = [
  "QODERCN_CONFIG_DIR",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
  "https_proxy",
  "http_proxy",
  "all_proxy",
  "no_proxy",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NODE_EXTRA_CA_CERTS",
] as const;

export function isQoderCnLocalSettings(settings: AcpRegistrySettings): boolean {
  return settings.source === "local" && isQoderCnCommand(settings.commandPath);
}

export const readQoderCnInstalledVersion = Effect.fn("QoderCnMaintenance.readInstalledVersion")(
  function* (spawn: ResolvedAcpRegistryAgent["spawn"]) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const environment = spawn.env ?? (yield* HostProcess.Environment);
    const child = yield* spawner.spawn(
      ChildProcess.make(spawn.command, ["--version"], {
        env: providerProbeEnvironment(environment),
        ...(spawn.cwd === undefined ? {} : { cwd: spawn.cwd }),
        shell: false,
      }),
    );
    yield* Effect.addFinalizer(() => child.kill().pipe(Effect.ignore));
    const [stdout, exitCode] = yield* Effect.all(
      [
        collectUint8StreamText({ stream: child.stdout, maxBytes: 4_096 }),
        child.exitCode,
        Stream.runDrain(child.stderr),
      ],
      { concurrency: "unbounded" },
    );
    return Number(exitCode) === 0 && !stdout.truncated
      ? (CLI_VERSION.exec(stdout.text.trim())?.[1] ?? null)
      : null;
  },
  Effect.scoped,
  Effect.timeoutOption("5 seconds"),
  Effect.map(Option.getOrNull),
  Effect.orElseSucceed(() => null),
);

export const resolveQoderCnMaintenance = Effect.fn("QoderCnMaintenance.resolve")(function* (
  spawn: ResolvedAcpRegistryAgent["spawn"],
) {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const platform = yield* HostProcess.Platform;
  const home = yield* HostProcess.HomeDirectory;
  const binDirectory = path.join(home, ".qoder-cn", "bin", "qoderclicn");
  const entry =
    platform === "win32"
      ? path.join(binDirectory, "qoderclicn.exe")
      : path.join(home, ".local", "bin", "qoderclicn");
  const normalizePath = platform === "win32" ? normalizeCommandPath : path.normalize;
  const entryPath = normalizePath(entry);
  let command = spawn.command;
  // An alias to the versioned binary stays pinned after the updater replaces the entry point.
  for (let links = 0; links < 8 && normalizePath(command) !== entryPath; links++) {
    const target = yield* fileSystem.readLink(command).pipe(Effect.option);
    if (Option.isNone(target)) break;
    command = path.resolve(path.dirname(command), target.value);
  }
  const [realEntry, realBinDirectory] = yield* Effect.all([
    fileSystem.realPath(entry).pipe(Effect.option),
    fileSystem.realPath(binDirectory).pipe(Effect.option),
  ]);
  const nativeInstallation =
    normalizePath(command) === entryPath &&
    Option.isSome(realEntry) &&
    Option.isSome(realBinDirectory) &&
    normalizePath(path.dirname(realEntry.value)) === normalizePath(realBinDirectory.value) &&
    /^qoderclicn(?:-\d+\.\d+\.\d+(?:[-+][\w.+-]+)?)?(?:\.exe)?$/i.test(
      path.basename(realEntry.value),
    );
  if (!nativeInstallation) {
    return yield* resolveProviderMaintenanceCapabilitiesEffect(packageMaintenance, {
      binaryPath: spawn.command,
      ...(spawn.env === undefined ? {} : { env: spawn.env }),
    });
  }

  const client = yield* HttpClient.HttpClient;
  const environment = Object.fromEntries(
    QODER_UPDATE_ENV_KEYS.flatMap((name) => {
      const value = spawn.env?.[name];
      return value === undefined ? [] : [[name, value]];
    }),
  );
  return makeProviderMaintenanceCapabilities({
    provider: DRIVER_KIND,
    packageName: null,
    updateExecutable: entry,
    updateArgs: ["update"],
    updateLockKey: "qoder-cn-native",
    platform,
    env: environment,
    latestVersion: null,
    lookupLatestVersion: client.get(LATEST_MANIFEST).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Manifest)),
      Effect.map(({ latest }) => CLI_VERSION.exec(latest)?.[1] ?? null),
      Effect.timeoutOption("4 seconds"),
      Effect.map(Option.getOrNull),
      Effect.orElseSucceed(() => null),
    ),
  });
});
