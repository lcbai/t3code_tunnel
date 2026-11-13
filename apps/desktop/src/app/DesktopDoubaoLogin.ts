import * as HostProcess from "@t3tools/shared/HostProcess";
import { DOUBAO_CLI_LOGIN_COMMAND } from "@t3tools/shared/projectScripts";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

const LOGIN_SCRIPT = `#!/bin/zsh -l
self=\${0:a}
/bin/rm -f -- "$self"
/bin/rmdir -- "\${self:h}" 2>/dev/null
export PATH="\${PATH:+$PATH:}/opt/homebrew/bin:/usr/local/bin"
if ! command -v doubao >/dev/null 2>&1; then
  printf '%s\\n' '找不到豆包 CLI。请先安装 Node.js，然后运行 npm install -g @bytedance/doubao-cli，再运行 ${DOUBAO_CLI_LOGIN_COMMAND}。' >&2
  exit 127
fi
exec ${DOUBAO_CLI_LOGIN_COMMAND}
`;

export const openDoubaoLoginTerminal = Effect.fn("desktop.doubaoLogin.openTerminal")(
  function* () {
    if ((yield* HostProcess.Platform) !== "darwin") return false;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

    return yield* Effect.acquireUseRelease(
      fileSystem.makeTempDirectory({ prefix: "t3code-doubao-login-" }),
      (directory) =>
        Effect.scoped(
          Effect.gen(function* () {
            const script = path.join(directory, "doubao-login.command");
            yield* fileSystem.writeFileString(script, LOGIN_SCRIPT, { flag: "wx", mode: 0o700 });
            const child = yield* spawner.spawn(
              ChildProcess.make("/usr/bin/open", ["-b", "com.apple.Terminal", script], {
                stdin: "ignore",
                stdout: "ignore",
                stderr: "ignore",
              }),
            );
            return (yield* child.exitCode) === 0;
          }),
        ),
      // Terminal opens the document asynchronously, so the script removes itself once it starts.
      (directory, result) =>
        Exit.isSuccess(result) && result.value
          ? Effect.void
          : fileSystem.remove(directory, { recursive: true, force: true }).pipe(Effect.ignore),
    );
  },
  Effect.orElseSucceed(() => false),
);
