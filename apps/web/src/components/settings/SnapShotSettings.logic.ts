import type { ClientSettingsPatch, DesktopSnapShotState, SnapShotSound } from "@t3tools/contracts";
import {
  captureSetupBackend,
  captureSetupDesktopName,
  captureSetupAccessReady,
  captureSetupMacPermissionsReady,
} from "./SnapShotSetupDialog.logic";

export function snapShotStatus(state: DesktopSnapShotState | null, enabled: boolean): string {
  if (!state) return "Checking snapshots…";
  if (state.mode === "unavailable") return state.message ?? "Not supported on this platform.";
  if (!enabled) return "Turn this on to set up snapshots.";
  return snapShotSetupSummary(state, enabled);
}

export function snapShotSetupSummary(state: DesktopSnapShotState, enabled: boolean): string {
  if (state.message) return "需要注意抓获";
  if (state.linuxBackend === "hyprland" && state.hyprlandHelper?.status !== "ready")
    return state.hyprlandHelper?.status === "error" ? "检查设置中的抓取访问" : "安装抓取帮助以继续";
  if (captureSetupBackend(state) === "gnome" && state.gnomeExtension?.status !== "enabled")
    return "设置活动窗口快照";
  if (captureSetupBackend(state) === "kde" && state.kdeHelper?.status !== "ready")
    return state.kdeHelper?.status === "error" ? "检查设置中的抓取访问" : "安装抓取帮助以继续";
  if (captureSetupBackend(state) === "picker") return "仅手动抓取。每次您会选择窗口。";
  if (!enabled) return "允许继续抓取";
  if (state.shortcutPending)
    return state.linuxBackend === "hyprland" ? "正在连接您的快捷键…" : "等待快捷键权限";
  if (state.shortcutVerified) return "准备捕捉";
  if (state.linuxBackend === "niri" && state.shortcutBinding) return "使用另一个应用程序的快捷键";
  if (state.linuxBackend === "hyprland" && state.shortcutActionRegistered)
    return "使用另一个应用程序的快捷键";
  if (state.shortcutRegistered) return state.shortcutLabel ? "准备捕捉" : "快捷键已保存";
  return "完成快捷键设置";
}

export function snapShotShortcutStatus(state: DesktopSnapShotState | null): string | null {
  if (!state) return null;
  if (state.linuxBackend === "hyprland") return state.shortcutMessage;
  if (state.shortcutPending) return "Approve the shortcut permission prompt to continue.";
  if (state.shortcutRegistered) return state.mode === "portal" ? null : "Shortcut saved.";
  return state.shortcutMessage;
}

export function snapShotSetupButtonLabel(state: DesktopSnapShotState | null): string {
  if (!state) return "继续设置";
  if (captureSetupAccessReady(state)) return "管理抓取";
  const desktop = captureSetupDesktopName(state);
  return desktop ? `设置${desktop} 抓取` : "继续设置";
}

export function snapShotSetupComplete(
  state: DesktopSnapShotState | null,
  includeAccessibility: boolean,
): boolean {
  if (state?.windows) return true;
  return (
    state?.macPermissions !== undefined &&
    captureSetupAccessReady(state) &&
    captureSetupMacPermissionsReady(state, includeAccessibility) &&
    state.shortcutRegistered
  );
}

export type SnapShotSoundSelection = SnapShotSound | "off";

export function snapShotFeedbackUnavailableMessage(
  state: DesktopSnapShotState | null,
): string | undefined {
  if (state?.mode !== "portal" || state.linuxFeedbackAvailable) return undefined;
  if (state.linuxBackend === "hyprland")
    return state.hyprlandHelper?.status === "ready"
      ? "此桌面上没有抓取效果。"
      : "安装或更新抓取帮助以启用效果。";
  if (state.linuxBackend === "niri") return "尼里没有捕捉效果";
  if (state.linuxBackend === "kde")
    return state.kdeHelper?.status === "ready"
      ? "此桌面上没有抓取效果。"
      : "安装或更新抓取帮助以启用效果。";
  return state.linuxBackend === "gnome-extension"
    ? "更新 GNOME 扩展名，然后签出并返回以启用效果。"
    : captureSetupBackend(state) === "gnome"
      ? "完成扩展设置以启用效果。"
      : "此桌面上没有抓取效果。";
}

export function snapShotDescription(state: DesktopSnapShotState | null): string {
  return state?.mode === "portal" && captureSetupBackend(state) === "picker"
    ? "这里没有自动抓取。请选择一个窗口。"
    : "抓取一个窗口并附在您当前草稿上。";
}

export function snapShotAccessibilityUnavailableMessage(
  state: DesktopSnapShotState | null,
): string | undefined {
  if (state?.mode !== "portal") return undefined;
  if (state.linuxBackend === "picker" || state.linuxBackend === "screenshot-portal")
    return "此桌面只提供截图。";
  return undefined;
}

export function snapShotUnavailableMessage(hasBridge: boolean): string | undefined {
  if (hasBridge) return undefined;
  return typeof window !== "undefined" && window.desktopBridge
    ? "更新桌面应用程序以使用快照。"
    : "仅在桌面应用程序中可用。";
}

export function snapShotSoundPatch(sound: SnapShotSoundSelection): ClientSettingsPatch {
  return sound === "off"
    ? { snapShotPlaySound: false }
    : { snapShotPlaySound: true, snapShotSound: sound };
}

export function createRecordingRequestTracker() {
  let currentRequest: symbol | null = null;

  return {
    tryBegin() {
      if (currentRequest) return null;
      currentRequest = Symbol();
      return currentRequest;
    },
    clear() {
      currentRequest = null;
    },
    owns(request: symbol) {
      return currentRequest === request;
    },
  };
}
