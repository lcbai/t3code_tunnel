import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Redacted from "effect/Redacted";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as HttpClient from "effect/http/HttpClient";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import * as DesktopConfig from "../app/DesktopConfig.ts";
import * as DesktopManagedPolicy from "../app/DesktopManagedPolicy.ts";
import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronSafeStorage from "../electron/ElectronSafeStorage.ts";
import * as DesktopFrpTunnel from "./DesktopFrpTunnel.ts";

const localUrl = new URL("http://127.0.0.1:47291");
const tunnelConfig = { url: "https://t3.example.test:8443/", token: 'setup-key-"quoted"' };

it.effect("restores the tunnel on the current backend port and removes it when disabled", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fileSystem.makeTempDirectoryScoped();
    const settingsPath = path.join(directory, "frp-tunnel.enc");
    const commands = yield* Queue.unbounded<{
      readonly name: string;
      readonly config: string;
      readonly token: string | undefined;
    }>();
    const exits = yield* Queue.unbounded<void>();
    const spawner = ChildProcessSpawner.make((command) =>
      Effect.gen(function* () {
        if (command._tag !== "StandardCommand" || typeof command.args[1] !== "string") {
          return yield* Effect.die("expected a frpc config file");
        }
        const config = yield* fileSystem.readFileString(command.args[1]);
        const token = command.options.env?.T3CODE_FRP_TOKEN;
        yield* Queue.offer(commands, {
          name: command.command,
          config,
          token: Redacted.isRedacted(token) ? Redacted.value(token) : undefined,
        });
        return yield* Effect.acquireRelease(
          Effect.succeed(
            ChildProcessSpawner.makeHandle({
              pid: ChildProcessSpawner.ProcessId(123),
              stdout: Stream.empty,
              stderr: Stream.empty,
              all: Stream.empty,
              exitCode: Effect.never,
              isRunning: Effect.succeed(true),
              kill: () => Effect.void,
              stdin: Sink.drain,
              getInputFd: () => Sink.drain,
              getOutputFd: () => Stream.empty,
              unref: Effect.succeed(Effect.void),
            }),
          ),
          () => Queue.offer(exits, undefined),
        );
      }),
    );
    const layer = DesktopFrpTunnel.layer.pipe(
      Layer.provide(
        Layer.mergeAll(
          DesktopConfig.layerTest({ T3CODE_FRPC_PATH: "test-frpc" }),
          DesktopManagedPolicy.layerTest(),
          Layer.succeed(HostProcess.Platform, "darwin"),
          Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, spawner),
          Layer.succeed(
            HttpClient.HttpClient,
            HttpClient.make(() => Effect.never),
          ),
          Layer.succeed(ElectronApp.ElectronApp, {
            metadata: Effect.succeed({ isPackaged: false }),
          } as unknown as ElectronApp.ElectronApp["Service"]),
          Layer.succeed(ElectronSafeStorage.ElectronSafeStorage, {
            isEncryptionAvailable: Effect.succeed(true),
            selectedStorageBackend: Effect.succeedNone,
            encryptString: (value) => Effect.succeed(new TextEncoder().encode(value).reverse()),
            decryptString: (value) => Effect.succeed(new TextDecoder().decode(value.reverse())),
          }),
        ),
      ),
    );

    yield* Effect.gen(function* () {
      const tunnel = yield* DesktopFrpTunnel.DesktopFrpTunnel;
      yield* tunnel.restore(directory, localUrl);
      assert.equal((yield* tunnel.state).status, "disabled");

      const connecting = yield* tunnel.configure(tunnelConfig);
      assert.equal(connecting.url, "https://t3.example.test:8443");
      const command = yield* Queue.take(commands);
      assert.equal(command.name, "test-frpc");
      assert.equal(command.token, '"setup-key-\\"quoted\\""');
      assert.include(command.config, 'customDomains = ["t3.example.test"]');
      assert.include(command.config, "serverPort = 8443");
      assert.include(command.config, "localPort = 47291");
      assert.notInclude(command.config, tunnelConfig.token);
      assert.notInclude(yield* fileSystem.readFileString(settingsPath), tunnelConfig.token);

      yield* tunnel.stop;
      yield* Queue.take(exits);
      yield* tunnel.restore(directory, new URL("http://127.0.0.1:49301"));
      const restored = yield* Queue.take(commands);
      assert.equal(restored.token, command.token);
      assert.include(restored.config, "localPort = 49301");

      assert.equal((yield* tunnel.configure(null)).status, "disabled");
      yield* Queue.take(exits);
      assert.isFalse(yield* fileSystem.exists(settingsPath));
      assert.isNull(yield* tunnel.endpoint);
    }).pipe(Effect.provide(layer));
  }).pipe(Effect.provide(NodeServices.layer)),
);
