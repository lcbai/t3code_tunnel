import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  getNewProjectRepository,
  type NewProjectPublishTarget,
} from "@t3tools/client-runtime/operations/projects";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";

import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { waitForProject } from "~/state/entities";
import { projectEnvironment } from "~/state/projects";
import { sourceControlEnvironment } from "~/state/sourceControl";
import { useAtomCommand } from "~/state/use-atom-command";
import { useNewThreadHandler } from "./useHandleNewThread";
import { suggestAppAccessForRemote } from "../components/sourceControlAppAccessToast";

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : "发生了错误。";
}

export function useNewProject() {
  const createNew = useAtomCommand(projectEnvironment.createNew, { reportFailure: false });
  const publishRepository = useAtomCommand(sourceControlEnvironment.publishRepository, {
    reportFailure: false,
  });
  const handleNewThread = useNewThreadHandler();

  const publishNewRepository = async (input: {
    readonly environmentId: EnvironmentId;
    readonly workspaceRoot: string;
    readonly target: NewProjectPublishTarget;
  }) => {
    const { label } = input.target.definition;
    const result = await publishRepository({
      environmentId: input.environmentId,
      input: {
        cwd: input.workspaceRoot,
        provider: input.target.definition.kind,
        repository: getNewProjectRepository(input.target, input.workspaceRoot),
        visibility: "private",
      },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: `无法创建${label} transaction`,
            description: `${errorMessage(squashAtomCommandFailure(result))}在Git 菜单中使用 Publish Repository 来再次尝试。`,
          }),
        );
      }
      return;
    }
    toastManager.add(
      stackedThreadToast({
        type: "success",
        title: `发布到${label}`,
        description: result.value.repository.nameWithOwner,
      }),
    );
    void suggestAppAccessForRemote(input.environmentId, result.value.remoteUrl);
  };

  return async (input: {
    readonly environmentId: EnvironmentId;
    readonly name: string;
    readonly publishTo: NewProjectPublishTarget | null;
  }): Promise<boolean> => {
    const result = await createNew({
      environmentId: input.environmentId,
      input: { name: input.name },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "无法创建工程",
            description: errorMessage(squashAtomCommandFailure(result)),
          }),
        );
      }
      return false;
    }

    const { projectId, workspaceRoot, commitError } = result.value;
    toastManager.add(
      stackedThreadToast(
        commitError === undefined
          ? { type: "success", title: `创建了${input.name}`, description: workspaceRoot }
          : {
              type: "warning",
              title: `创建了${input.name}没有第一次承诺`,
              description: `${commitError}项目在${workspaceRoot} 。`,
            },
      ),
    );
    if (input.publishTo) {
      void publishNewRepository({
        environmentId: input.environmentId,
        workspaceRoot,
        target: input.publishTo,
      });
    }

    const projectRef = scopeProjectRef(input.environmentId, projectId);
    // Wait for the stored project path; drafts use it as their key.
    const project = await waitForProject(projectRef).catch((error: unknown) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "打开工程失败",
          description: `${errorMessage(error)}一旦客户端赶上，它将会出现在侧边栏。`,
        }),
      );
      return null;
    });
    if (project === null) return true;
    await handleNewThread(projectRef).catch((error: unknown) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "打开工程失败",
          description: errorMessage(error),
        }),
      );
    });
    return true;
  };
}
