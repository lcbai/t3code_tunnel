import { PermissionChecklist, PermissionContinueButton } from "../permissions/PermissionChecklist";
import { usePermissionStatus } from "../permissions/usePermissionStatus";
import {
  isModifierPairShortcut,
  type DesktopSnapShotSetupAction,
  type DesktopSnapShotState,
} from "@t3tools/contracts";
import { useState, type ReactNode } from "react";
import { MacAccessibilityIcon, MacScreenRecordingIcon } from "../Icons";
import { CaptureShortcutConfig } from "./CaptureShortcutConfig";
import { Button } from "../ui/button";
import { Dialog, DialogDescription } from "../ui/dialog";
import { WizardSteps, WizardPopup, WizardHeader, WizardPanel, WizardFooter } from "../ui/wizard";
import {
  captureSetupAccessReady,
  captureSetupBackend,
  captureSetupCheckMessage,
  captureSetupDesktopName,
  captureSetupInitialStep,
  captureSetupShortcutReady,
  type CaptureSetupStep,
} from "./SnapShotSetupDialog.logic";

const SETUP_STEPS = [
  { id: "access", label: "访问" },
  { id: "shortcut", label: "快捷键" },
] as const;

const GNOME_ACCESS_COPY = {
  "not-installed": {
    title: "安装扩展名",
    description: "T3 Code GNOME 扩展让您抓取其他窗口并把它们带入您的草稿。 安装后签署一次。",
  },
  "restart-required": {
    title: "安装了扩展",
    description: "省省你的活儿，然后签个字回来，你的安排在这里等着",
  },
  "update-required": {
    title: "更新扩展名",
    description: "安装更新，然后签署并返回。",
  },
  "extensions-disabled": {
    title: "允许 GNOME 扩展",
    description: "打开 GNOME 扩展并打开扩展，然后再次检查。",
  },
  disabled: {
    title: "启用扩展名",
    description: "启用T3 Code SnapShots 开始抓取窗口。",
  },
  enabled: {
    title: "捕捉准备就绪",
    description: "接下来，选择您的快捷键。",
  },
  unsupported: {
    title: "无法自动抓取",
    description: "使用命令调色板上的快照来选择窗口。",
  },
  error: {
    title: "无法设置扩展",
    description:
      "请检查access-date=中的日期值 (帮助)T3 Code SnapShots in GNOME 扩展，然后再试一次。",
  },
};

export function SnapShotSetupDialog({
  state,
  initialStep,
  wasEnabled,
  includeAccessibility,
  busy: actionBusy,
  error,
  shortcutInput,
  shortcutStatus,
  shortcutChanged,
  canSaveShortcut,
  onSaveShortcut,
  onEnable,
  onAction,
  onRefresh,
  onClose,
  onLeaveStep,
}: {
  state: DesktopSnapShotState;
  initialStep: CaptureSetupStep;
  wasEnabled: boolean;
  includeAccessibility: boolean;
  busy: boolean;
  error: string | null;
  shortcutInput: ReactNode;
  shortcutStatus: string | null | undefined;
  shortcutChanged: boolean;
  canSaveShortcut: boolean;
  onSaveShortcut: () => Promise<boolean>;
  onEnable: () => Promise<boolean>;
  onAction: (action: DesktopSnapShotSetupAction) => Promise<void>;
  onRefresh: () => Promise<DesktopSnapShotState | undefined>;
  onClose: (completed: boolean) => Promise<void>;
  onLeaveStep: () => void;
}) {
  const [step, setStep] = useState(() => captureSetupInitialStep(state, initialStep));
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [configBusy, setConfigBusy] = useState(false);
  const busy = actionBusy || checking || configBusy;
  const backend = captureSetupBackend(state);
  const configShortcut = backend === "niri" || backend === "hyprland";
  const desktop = captureSetupDesktopName(state);
  const extension = state.gnomeExtension;
  const helper = backend === "hyprland" ? state.hyprlandHelper : state.kdeHelper;
  const helperBackend = backend === "kde" || backend === "hyprland";
  const installHelper = backend === "hyprland" ? "install-hyprland-helper" : "install-kde-helper";
  const removeHelper = backend === "hyprland" ? "remove-hyprland-helper" : "remove-kde-helper";
  const accessReady = captureSetupAccessReady(state);
  const permissionStatus = usePermissionStatus(
    async () => {
      const refreshed = await onRefresh();
      if (!refreshed?.macPermissions) throw new Error("Permission status unavailable");
      return refreshed.macPermissions;
    },
    state.macPermissions ?? { screenRecording: false, accessibility: false },
    Boolean(state.macPermissions) && step === "access" && !busy,
  );
  const macPermissions = state.macPermissions ? permissionStatus.status : undefined;
  const macPermissionsReady =
    !macPermissions ||
    permissionStatus.isReady(
      includeAccessibility ? ["screenRecording", "accessibility"] : ["screenRecording"],
    );
  const shortcutReady = captureSetupShortcutReady(state, shortcutChanged);
  const install = extension?.status === "not-installed" || extension?.status === "update-required";
  const enable = extension?.status === "disabled";
  const changeStep = (next: CaptureSetupStep) => {
    onLeaveStep();
    setChecked(false);
    setStep(next);
  };
  const checkAgain = async () => {
    if (busy) return;
    setChecking(true);
    setChecked(false);
    const refreshed = await onRefresh().finally(() => setChecking(false));
    setChecked(refreshed !== undefined);
  };
  const accessCopy =
    state.message && !macPermissions
      ? {
          title: "再来一次",
          description: "无法检查快照，再试一次",
        }
      : backend === "gnome" && extension
        ? extension.status === "enabled" && !accessReady
          ? {
              title: "检查抓取访问",
              description: "分机还没准备好，马上再试一次",
            }
          : GNOME_ACCESS_COPY[extension.status]
        : helperBackend
          ? helper?.status === "ready"
            ? {
                title: "捕捉准备就绪",
                description: "接下来，选择您的快捷键。",
              }
            : helper?.status === "error"
              ? {
                  title: "让我们修复捕捉通道",
                  description: "尝试重排抓取帮助器，然后再次检查。",
                }
              : {
                  title: helper?.status === "update-required" ? "更新抓取帮助" : "允许快照",
                  description:
                    "T3 Code 抓取帮助器让您抓取其他应用程序并返回您的草稿，它包含在T3 Code 中。",
                }
          : backend === "niri"
            ? {
                title: "捕捉准备就绪",
                description: "接下来，选择您的快捷键。",
              }
            : backend === "picker"
              ? {
                  title: "每次选择窗口",
                  description: "您的桌面不支持自动抓取。您会选择要抓取的窗口。",
                }
              : {
                  title: "允许快照",
                  description:
                    backend === "portal"
                      ? "您的桌面会在您第一次抓取时请求许可。"
                      : macPermissions
                        ? macPermissionsReady
                          ? "测试当前窗口的快照。如果macOS请绕过其窗口拾取器，请选择允许。 测试图像已被丢弃。"
                          : "允许每次许可，然后继续。"
                        : "在被提示开始抓取窗口时允许访问。",
                };
  const title = step === "access" ? accessCopy.title : "Choose your shortcut";
  const description =
    step === "access"
      ? accessCopy.description
      : configShortcut
        ? "Click the shortcut, then press the keys you want."
        : state.mode === "portal"
          ? "Choose your keys, then approve the permission prompt if asked."
          : "Use both Shift keys, or record a different shortcut.";
  const stepIndex = SETUP_STEPS.findIndex(({ id }) => id === step);
  const details = [
    ...new Set(
      [
        error,
        ...(step === "access"
          ? [
              state.message,
              backend === "gnome" &&
              (extension?.status === "error" || extension?.status === "unsupported")
                ? extension.message
                : null,
              helperBackend && helper?.status === "error" ? helper.message : null,
            ]
          : []),
      ].filter((detail) => detail !== null),
    ),
  ];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) void onClose(false);
      }}
    >
      <WizardPopup showCloseButton={!busy}>
        <WizardHeader title={desktop ? `为 ${desktop} 设置快照` : "设置快照"}>
          <WizardSteps
            steps={SETUP_STEPS.map((item) => item.label)}
            currentStep={stepIndex}
            isStepDisabled={(index) => busy || index > stepIndex}
            onStepChange={(index) => {
              const next = SETUP_STEPS[index];
              if (next && next.id !== step) changeStep(next.id);
            }}
          />
        </WizardHeader>
        <WizardPanel>
          <div className="space-y-4 text-sm">
            <div className="space-y-2" aria-live="polite">
              <h3 className="flex items-center gap-2 font-medium">{title}</h3>
              <DialogDescription>{description}</DialogDescription>
            </div>
            {step === "access" ? (
              <>
                <p
                  role="status"
                  aria-atomic="true"
                  className={
                    checked && !busy && !error ? "text-xs text-muted-foreground" : "sr-only"
                  }
                >
                  {checked && !busy && !error ? captureSetupCheckMessage(state) : null}
                </p>
                {macPermissions ? (
                  <PermissionChecklist
                    busy={busy}
                    permissions={[
                      {
                        id: "screenRecording",
                        icon: <MacScreenRecordingIcon className="size-8 shrink-0 drop-shadow-sm" />,
                        title: "屏幕记录",
                        description: "抓住你用的窗户",
                        granted: macPermissions.screenRecording,
                        onAllow: () => void onAction("allow-screen-recording"),
                      },
                      {
                        id: "accessibility",
                        icon: <MacAccessibilityIcon className="size-8 shrink-0 drop-shadow-sm" />,
                        title: "无障碍",
                        description: includeAccessibility
                          ? "包含从抓取的应用程序中获取的文本和控件。"
                          : "可选。 包含从抓取的应用程序中获取的文本和控件。",
                        granted: macPermissions.accessibility,
                        onAllow: () => void onAction("allow-accessibility"),
                      },
                    ]}
                  />
                ) : null}
                {permissionStatus.error && macPermissions ? (
                  <p role="status" className="text-xs text-muted-foreground">
                    {permissionStatus.error}
                  </p>
                ) : null}
                {helperBackend && helper?.status === "error" ? (
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void onAction(installHelper)}
                  >
                    Reinstall 帮助器
                  </Button>
                ) : null}
              </>
            ) : configShortcut ? (
              <CaptureShortcutConfig
                state={state}
                disabled={actionBusy || checking || !accessReady}
                onBusyChange={setConfigBusy}
                onSaved={onRefresh}
                onComplete={() => onClose(true)}
              />
            ) : (
              <div className="space-y-3">
                {shortcutInput}
                {shortcutStatus ? (
                  <p className="text-xs text-muted-foreground" role="status">
                    {shortcutStatus}
                  </p>
                ) : null}
                {!shortcutChanged &&
                !state.shortcutRegistered &&
                !state.shortcutPending &&
                state.shortcutCanRetry !== false &&
                !isModifierPairShortcut(state.shortcut) ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void onAction("retry-shortcut")}
                  >
                    {state.mode === "portal" ? "快捷权限" : "重试"}
                  </Button>
                ) : null}
              </div>
            )}
            {step === "shortcut" && !accessReady ? (
              <p role="alert" className="text-destructive">
                抓捕需要注意回去检查访问
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-destructive">
                无法完成这一步。再次尝试或检查高级求援。
              </p>
            ) : null}
            {details.length > 0 || (step === "access" && (backend === "gnome" || helperBackend)) ? (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">高级</summary>
                <div className="mt-3 space-y-3">
                  {details.map((detail) => (
                    <p key={detail} className="break-words">
                      {detail}
                    </p>
                  ))}
                  {step === "access" && (backend === "gnome" || helperBackend) ? (
                    <p>包含在T3 Code. 不需要下载。</p>
                  ) : null}
                  {step === "access" && backend === "gnome" && extension?.status === "enabled" ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void onAction("disable-extension")}
                    >
                      禁用扩展名
                    </Button>
                  ) : null}
                  {step === "access" && helperBackend && helper?.status !== "not-installed" ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void onAction(removeHelper)}
                    >
                      删除抓取帮助
                    </Button>
                  ) : null}
                </div>
              </details>
            ) : null}
          </div>
        </WizardPanel>
        <WizardFooter>
          {step !== "access" ? (
            <Button variant="ghost" disabled={busy} onClick={() => changeStep("access")}>
              返回
            </Button>
          ) : null}
          <Button variant="ghost" disabled={busy} onClick={() => void onClose(false)}>
            {wasEnabled ? "关闭" : "以后再写吧"}
          </Button>
          {step === "access" ? (
            helperBackend && !accessReady && helper?.status !== "ready" ? (
              <Button
                disabled={busy}
                aria-busy={busy}
                onClick={() =>
                  void (helper?.status === "error" ? checkAgain() : onAction(installHelper))
                }
              >
                {checking
                  ? "正在检查…"
                  : busy
                    ? "正在安装…"
                    : helper?.status === "error"
                      ? "再检查一遍"
                      : helper?.status === "update-required"
                        ? "更新帮助"
                        : "安装助手"}
              </Button>
            ) : backend === "gnome" && !accessReady && extension?.status !== "enabled" ? (
              <Button
                disabled={busy}
                aria-busy={checking}
                onClick={() =>
                  void (install
                    ? onAction("install-extension")
                    : enable
                      ? onAction("enable-extension")
                      : checkAgain())
                }
              >
                {checking
                  ? "正在检查…"
                  : busy
                    ? install
                      ? "正在安装…"
                      : enable
                        ? "正在启用…"
                        : "工作时…"
                    : install
                      ? extension?.status === "update-required"
                        ? "更新扩展名"
                        : "安装扩展名"
                      : enable
                        ? "启用扩展名"
                        : "再检查一遍"}
              </Button>
            ) : (
              <PermissionContinueButton
                ready={macPermissionsReady}
                busy={busy}
                onClick={async () => {
                  if (await onEnable()) changeStep("shortcut");
                }}
              >
                {busy
                  ? "工作时…"
                  : macPermissions
                    ? "测试抓取和继续"
                    : backend === "direct"
                      ? "允许抓取"
                      : !accessReady && !macPermissions
                        ? "重试"
                        : "继续"}
              </PermissionContinueButton>
            )
          ) : !configShortcut ? (
            <Button
              disabled={
                busy || !accessReady || (shortcutChanged ? !canSaveShortcut : !shortcutReady)
              }
              onClick={async () => {
                if (!shortcutChanged || (await onSaveShortcut())) await onClose(true);
              }}
            >
              {busy ? "正在保存…" : shortcutChanged ? "保存并完成" : "完成"}
            </Button>
          ) : null}
        </WizardFooter>
      </WizardPopup>
    </Dialog>
  );
}
