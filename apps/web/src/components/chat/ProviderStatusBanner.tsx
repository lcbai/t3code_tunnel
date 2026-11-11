import {
  type EnvironmentId,
  type ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { memo, useRef, useState } from "react";
import { InfoIcon, XIcon } from "lucide-react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../ui/alert";
import { Button, InlineButton } from "../ui/button";
import { formatProviderDriverKindLabel } from "../../providerModels";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { RefreshIcon } from "../ui/refresh-icon";

function getIncompatibleVersion(status: ServerProvider) {
  const compatibility = status.compatibilityAdvisory;
  if (status.status === "error" && status.auth.status === "unauthenticated") return null;
  return compatibility?.status === "broken" ||
    (status.status === "ready" && compatibility?.status === "unsupported")
    ? compatibility
    : null;
}

export function getProviderStatusBannerKey(status: ServerProvider | null): string | null {
  if (!status || status.status === "disabled") return null;
  const incompatible = getIncompatibleVersion(status);
  if (incompatible) {
    return [
      status.instanceId,
      incompatible.status,
      status.version ?? "",
      incompatible.message ?? "",
    ].join("\u0000");
  }
  if (status.status === "ready") return null;
  // Antigravity validates credentials at session start; unknown restart auth is not failure.
  if (
    status.driver === "antigravity" &&
    status.installed &&
    status.status === "warning" &&
    status.auth.status === "unknown"
  ) {
    return null;
  }
  return [status.instanceId, status.status, status.auth.status, status.message ?? ""].join(
    "\u0000",
  );
}

export function shouldShowProviderStatusBanner(
  status: ServerProvider | null,
  dismissedBannerKey: string | null,
): boolean {
  const bannerKey = getProviderStatusBannerKey(status);
  return bannerKey !== null && bannerKey !== dismissedBannerKey;
}

export function hasProviderSetup(status: ServerProvider): boolean {
  return (
    status.driver === "antigravity" ||
    status.setup?.canAuthenticate === true ||
    status.setup?.canInstall === true
  );
}

export function getProviderStatusMessage(status: ServerProvider): string {
  if (
    status.auth.status !== "unauthenticated" &&
    status.compatibilityAdvisory?.status === "broken" &&
    status.compatibilityAdvisory.message
  ) {
    return status.compatibilityAdvisory.message;
  }
  if (status.message) return status.message;
  const providerName = status.displayName?.trim() || formatProviderDriverKindLabel(status.driver);
  if (!status.installed && hasProviderSetup(status)) {
    return `在此环境中安装${formatProviderDriverKindLabel(status.driver)} 打开代理提供方设置。`;
  }
  if (status.auth.status === "unauthenticated") {
    if (hasProviderSetup(status)) {
      return status.driver === "antigravity"
        ? "打开代理提供方设置以与Google签约。"
        : "打开代理提供方设置以登录。";
    }
    return "通过CLI登录以重新验证。";
  }
  return status.status === "ready"
    ? "此提供者没有可用的模型。"
    : status.status === "error"
      ? `${providerName} 提供者无法使用。`
      : `${providerName} 提供者可用性有限。`;
}

export const ProviderStatusBanner = memo(function ProviderStatusBanner({
  environmentId,
  onDismiss,
  onOpenProviderSetup,
  status,
}: {
  environmentId: EnvironmentId;
  onDismiss: () => void;
  onOpenProviderSetup?: (instanceId: ProviderInstanceId) => void;
  status: ServerProvider | null;
}) {
  const canRefresh = useAtomValue(serverEnvironment.refreshProviders.permissionAtom(environmentId));
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    label: "刷新提供者状态",
  });
  const refreshingRef = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = async () => {
    if (!status || !canRefresh || refreshingRef.current) return;
    refreshingRef.current = true;
    setIsRefreshing(true);
    await refreshProviders({
      environmentId,
      input: { instanceId: status.instanceId, refreshModels: true },
    });
    refreshingRef.current = false;
    setIsRefreshing(false);
  };

  if (!status || getProviderStatusBannerKey(status) === null) {
    return null;
  }

  const providerName = status.displayName?.trim() || formatProviderDriverKindLabel(status.driver);
  const isUnauthenticated = status.status === "error" && status.auth.status === "unauthenticated";
  const incompatible = getIncompatibleVersion(status);
  const title = isUnauthenticated
    ? `${providerName} is unauthenticated`
    : incompatible
      ? `${providerName} ${status.version ?? ""} is ${incompatible.status === "broken" ? "known to be broken" : "unsupported"}`
      : `${providerName} provider status`;
  const message = incompatible?.message ?? getProviderStatusMessage(status);
  const isWarning =
    incompatible?.status !== "broken" && (status.status === "warning" || incompatible !== null);

  return (
    <div className="pointer-events-auto mx-auto w-fit max-w-[calc(100%-2rem)] pt-3">
      <Alert
        variant={isWarning ? "warning" : "error"}
        role={incompatible && incompatible.status !== "broken" ? "status" : "alert"}
        surface="glass"
        controlAlignment="first-line"
      >
        <InfoIcon />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>
          <div className="flex flex-col gap-2">
            <Tooltip>
              <TooltipTrigger render={<div className="line-clamp-3" />}>{message}</TooltipTrigger>
              <TooltipPopup side="top" className="whitespace-pre-wrap">
                {message}
              </TooltipPopup>
            </Tooltip>
            <div className="flex flex-wrap items-center justify-end gap-3">
              {onOpenProviderSetup && hasProviderSetup(status) ? (
                <InlineButton onClick={() => onOpenProviderSetup(status.instanceId)}>
                  打开代理提供方设置
                </InlineButton>
              ) : null}
              <Button
                aria-label={`刷新${providerName} 提供者状态`}
                disabled={!canRefresh || isRefreshing}
                onClick={() => void refresh()}
                size="xs"
                variant="outline"
              >
                <RefreshIcon />
                {isRefreshing ? "刷新中…" : "刷新"}
              </Button>
            </div>
          </div>
        </AlertDescription>
        <AlertAction>
          <Button
            aria-label={`解职${providerName} 提供者${status.status}`}
            onClick={onDismiss}
            size="icon-xs"
            variant="ghost-muted"
          >
            <XIcon />
          </Button>
        </AlertAction>
      </Alert>
    </div>
  );
});
