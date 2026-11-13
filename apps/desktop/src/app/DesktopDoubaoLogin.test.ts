import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import { openDoubaoLoginTerminal } from "./DesktopDoubaoLogin.ts";

it.layer(NodeServices.layer)("DesktopDoubaoLogin", (it) => {
  it.effect.each([0, 1])(
    "keeps the script available only after a successful Terminal launch (exit %i)",
    (exitCode) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        let scriptPath: string | undefined;
        yield* Effect.addFinalizer(() =>
          scriptPath === undefined
            ? Effect.void
            : fs
                .remove(path.dirname(scriptPath), { recursive: true, force: true })
                .pipe(Effect.ignore),
        );
        const spawner = ChildProcessSpawner.make((command) =>
          Effect.gen(function* () {
            assert(ChildProcess.isStandardCommand(command));
            assert.equal(command.command, "/usr/bin/open");
            assert.deepEqual(command.args.slice(0, 2), ["-b", "com.apple.Terminal"]);
            const script = command.args[2];
            assert(typeof script === "string" && script.endsWith(".command"));
            scriptPath = script;
            assert.include(yield* fs.readFileString(script), "exec doubao login --qr=small");
            return ChildProcessSpawner.makeHandle({
              pid: ChildProcessSpawner.ProcessId(1),
              exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(exitCode)),
              isRunning: Effect.succeed(false),
              kill: () => Effect.void,
              unref: Effect.succeed(Effect.void),
              stdin: Sink.drain,
              stdout: Stream.empty,
              stderr: Stream.empty,
              all: Stream.empty,
              getInputFd: () => Sink.drain,
              getOutputFd: () => Stream.empty,
            });
          }),
        );
        const opened = yield* openDoubaoLoginTerminal().pipe(
          Effect.provideService(HostProcess.Platform, "darwin"),
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
        );

        assert(scriptPath);
        assert.equal(opened, exitCode === 0);
        assert.equal(yield* fs.exists(path.dirname(scriptPath)), exitCode === 0);
      }),
  );
});
