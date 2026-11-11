import type { WorkspaceState } from "../../state/workspaceModel";

export interface WorkspaceConnectionStatusPresentation {
  readonly label: string;
  readonly showsProgress: boolean;
}

function shouldShowWorkspaceConnectionStatus(state: WorkspaceState): boolean {
  if (state.networkStatus === "offline") return true;
  if (state.hasReadyEnvironment) return state.hasSyncingConnectedEnvironment;
  return (
    state.connectionError !== null ||
    state.hasConnectingEnvironment ||
    state.hasPendingShellSnapshot ||
    (state.hasLoadedShellSnapshot && !state.hasReadyEnvironment)
  );
}

function workspaceConnectionStatusLabel(state: WorkspaceState): string {
  if (state.networkStatus === "offline") return "你已离线";
  if (state.hasReadyEnvironment && state.hasSyncingConnectedEnvironment) {
    return state.hasLoadedShellSnapshot ? "正在同步会话…" : "正在加载会话…";
  }
  if (state.connectingEnvironments.length === 1) {
    return `正在重新连接 ${state.connectingEnvironments[0]!.environmentLabel}`;
  }
  if (state.connectingEnvironments.length > 1) {
    return `正在重新连接 ${state.connectingEnvironments.length} 个环境`;
  }
  if (state.connectionError !== null) return state.connectionError;
  if (state.hasPendingShellSnapshot) {
    return state.hasLoadedShellSnapshot ? "正在同步会话…" : "正在加载会话…";
  }
  return "未连接";
}

export function workspaceConnectionStatusPresentation(
  state: WorkspaceState,
): WorkspaceConnectionStatusPresentation | null {
  if (!shouldShowWorkspaceConnectionStatus(state)) return null;
  return {
    label: workspaceConnectionStatusLabel(state),
    showsProgress:
      state.networkStatus !== "offline" &&
      (state.hasReadyEnvironment || state.connectionError === null) &&
      (state.connectingEnvironments.length > 0 || state.hasPendingShellSnapshot),
  };
}
