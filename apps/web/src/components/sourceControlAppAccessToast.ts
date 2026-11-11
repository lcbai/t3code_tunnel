import type { EnvironmentId } from "@t3tools/contracts";
import { appSignInTargetForRemote } from "@t3tools/client-runtime/source-control-clients";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { sourceControlEnvironment } from "../state/sourceControl";
import { toastManager } from "./ui/toast";

/**
 * After a clone, suggests installing the forge app on the repository's owner when the server is
 * signed in with it but the app does not reach the repository.
 */
export async function suggestAppAccessForRemote(
  environmentId: EnvironmentId,
  remoteUrl: string,
): Promise<void> {
  const target = appSignInTargetForRemote(remoteUrl);
  if (target === null) return;
  const result = await runAtomCommand(
    appAtomRegistry,
    sourceControlEnvironment.checkAppAccess,
    { environmentId, input: target.input },
    { label: "检查应用程序访问", reportFailure: false, reportDefect: false },
  );
  if (result._tag !== "Success" || result.value.status !== "not-covered") return;
  const owner = target.input.repository.split("/")[0] ?? target.input.repository;
  const id = toastManager.add({
    type: "info",
    title: `Give ${target.appSignIn.appName} access to ${owner}`,
    description: `它没有安装在那里，所以GitHub 请求${target.input.repository} 使用您自己的登录和它的下限速率。`,
    actionProps: {
      children: "Install",
      onClick: () => {
        toastManager.close(id);
        window.open(target.appSignIn.installUrl, "_blank", "noopener,noreferrer");
      },
    },
  });
}
