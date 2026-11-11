import {
  AuthAccessReadScope,
  AuthAccessWriteScope,
  AuthDiagnosticsReadScope,
  AuthEnvironmentMaintainScope,
  AuthFilesystemReadScope,
  AuthFilesystemWriteScope,
  type AuthGrantScope,
  AuthOrchestrationOperateScope,
  AuthOrchestrationReadScope,
  AuthPreviewOperateScope,
  AuthProvidersManageScope,
  AuthSettingsWriteScope,
  AuthSourceControlWriteScope,
  AuthTerminalOperateScope,
  AuthTerminalReadScope,
} from "@t3tools/contracts";

export const AUTH_SCOPE_OPTIONS: ReadonlyArray<{
  readonly scope: AuthGrantScope;
  readonly title: string;
  readonly description: string;
}> = [
  {
    scope: AuthOrchestrationReadScope,
    title: "查看环境",
    description: "读取会话、状态、检查点和配置。",
  },
  {
    scope: AuthOrchestrationOperateScope,
    title: "操作任务",
    description: "启动、更新和停止任务。",
  },
  {
    scope: AuthSettingsWriteScope,
    title: "修改环境设置",
    description: "编辑环境偏好设置和快捷键。",
  },
  {
    scope: AuthProvidersManageScope,
    title: "管理供应商",
    description: "配置、安装、授权和更新供应商及用量来源。",
  },
  {
    scope: AuthEnvironmentMaintainScope,
    title: "维护环境",
    description: "更新服务器并控制环境进程。",
  },
  {
    scope: AuthPreviewOperateScope,
    title: "控制预览",
    description: "打开浏览器预览并运行浏览器自动化。",
  },
  {
    scope: AuthDiagnosticsReadScope,
    title: "查看诊断和用量",
    description: "读取进程诊断、资源使用历史和用量汇总。",
  },
  {
    scope: AuthTerminalReadScope,
    title: "查看终端",
    description: "读取现有终端的输出和状态。",
  },
  {
    scope: AuthTerminalOperateScope,
    title: "使用终端",
    description: "创建终端并向运行中的 Shell 发送输入。",
  },
  {
    scope: AuthSourceControlWriteScope,
    title: "修改源代码管理",
    description: "提交、推送、管理分支和仓库，以及修改拉取请求。",
  },
  {
    scope: AuthFilesystemReadScope,
    title: "读取文件",
    description: "浏览主机文件、搜索工作区并查看本地改动。",
  },
  {
    scope: AuthFilesystemWriteScope,
    title: "写入文件",
    description: "编辑工作区文件并将计划保存到磁盘。",
  },
  {
    scope: AuthAccessReadScope,
    title: "查看访问权限",
    description: "查看配对链接和已授权的客户端。",
  },
  {
    scope: AuthAccessWriteScope,
    title: "管理访问权限",
    description: "签发和撤销其他客户端的凭据。",
  },
];

/** Shown instead of the granted scopes while they are unknown, so every surface says the same thing. */
export function sessionPermissionsUnavailableMessage(input: {
  readonly connected: boolean;
  /** The check errored; the client retries it while connected. */
  readonly failed: boolean;
  /** The environment answered that this session is not signed in; retrying will not change that. */
  readonly rejected: boolean;
}): string {
  if (!input.connected) return "连接此环境后即可查看当前会话的权限。";
  if (input.rejected) return "此环境未接受当前会话，请重新连接。";
  return input.failed ? "无法验证权限，正在自动重试。" : "正在检查权限…";
}
