import { useState } from "react";
import {
  AuthAccessWriteScope,
  AuthEnvironmentMaintainScope,
  AuthStandardClientScopes,
  type AuthEnvironmentScope,
  type AuthPairingCredentialResult,
  type DesktopBridge,
  type DesktopFrpTunnelState,
  type EnvironmentId,
} from "@t3tools/contracts";
import { isAtomCommandInterrupted } from "@t3tools/client-runtime/state/runtime";
import * as DateTime from "effect/DateTime";

import { useNowSecond } from "~/hooks/useNowSecond";
import { authEnvironment } from "~/state/auth";
import { refreshDesktopFrpTunnelState } from "~/state/desktopFrpTunnel";
import { readEnvironmentScope } from "~/state/session";
import { useAtomCommand } from "~/state/use-atom-command";
import { formatExpiresInLabel } from "~/timestampFormat";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { QRCodeSvg } from "../ui/qr-code";
import { resolveDesktopPairingUrl } from "./pairingUrls";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

const STATUS_LABELS = {
  disabled: "未启用",
  connecting: "正在连接…",
  connected: "已连接",
  error: "连接失败",
} satisfies Record<DesktopFrpTunnelState["status"], string>;

function normalizeTunnelOrigin(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    return url.protocol === "https:" &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

function FrpPhonePairingCode({
  url,
  credential,
}: {
  readonly url: string;
  readonly credential: AuthPairingCredentialResult;
}) {
  const now = useNowSecond();
  const expiresAt = credential.expiresAt.epochMilliseconds;
  if (expiresAt <= now) {
    return <p role="status">二维码已过期，请重新生成。</p>;
  }
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-lg bg-white p-3">
        <QRCodeSvg
          value={resolveDesktopPairingUrl(url, credential.credential)}
          size={192}
          level="M"
          marginSize={2}
          title="FRP 手机配对二维码"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {formatExpiresInLabel(DateTime.formatIso(credential.expiresAt), now)}
      </p>
    </div>
  );
}

export function FrpTunnelSettings({
  bridge,
  state,
  readError,
  environmentId,
  delegatableScopes,
  managed,
}: {
  readonly bridge: Pick<DesktopBridge, "setFrpTunnel">;
  readonly state: DesktopFrpTunnelState | null;
  readonly readError: string | null;
  readonly environmentId: EnvironmentId;
  readonly delegatableScopes: readonly AuthEnvironmentScope[];
  readonly managed?: string | undefined;
}) {
  const [dialog, setDialog] = useState<"configure" | "disable" | "pair" | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingCode, setIsCreatingCode] = useState(false);
  const [pairing, setPairing] = useState<{
    readonly url: string;
    readonly credential: AuthPairingCredentialResult;
  } | null>(null);
  const createPairingCredential = useAtomCommand(authEnvironment.createPairingCredential, {
    reportFailure: false,
  });
  const scopes = AuthStandardClientScopes.filter((scope) => delegatableScopes.includes(scope));
  const canPair =
    managed === undefined &&
    delegatableScopes.includes(AuthAccessWriteScope) &&
    scopes.length > 0 &&
    state?.status === "connected";
  const configured = state?.url != null;
  const tunnelOrigin = normalizeTunnelOrigin(urlInput);
  const token = tokenInput.trim();

  const closeDialog = () => {
    setDialog(null);
    setError(null);
    setTokenInput("");
    setPairing(null);
  };

  const save = async (input: { url: string; token: string } | null) => {
    if (!readEnvironmentScope(environmentId, AuthEnvironmentMaintainScope)) return;
    setIsSaving(true);
    setError(null);
    try {
      await bridge.setFrpTunnel(input);
      refreshDesktopFrpTunnelState();
      closeDialog();
    } catch (cause) {
      const detail =
        cause instanceof Error
          ? /(?:^|: )DesktopFrpTunnelError: ([^\r\n]+)/u.exec(cause.message)?.[1]
          : undefined;
      setError(
        detail ??
          (input === null ? "无法停用 FRP 穿透，请重试。" : "无法保存 FRP 穿透设置，请重试。"),
      );
    }
    setIsSaving(false);
  };

  const openPairing = async () => {
    const url = state?.url;
    if (
      !canPair ||
      !url ||
      !readEnvironmentScope(environmentId, AuthAccessWriteScope) ||
      !scopes.every((scope) => readEnvironmentScope(environmentId, scope))
    ) {
      return;
    }
    setDialog("pair");
    setPairing(null);
    setError(null);
    setIsCreatingCode(true);
    const result = await createPairingCredential({
      environmentId,
      input: { scopes, persistent: true },
    });
    if (result._tag === "Success") {
      setPairing({ url, credential: result.value });
    } else if (!isAtomCommandInterrupted(result)) {
      setError("无法生成手机配对二维码，请重试。");
    } else {
      closeDialog();
    }
    setIsCreatingCode(false);
  };

  return (
    <>
      <SettingsRow
        {...searchableSetting("frp-tunnel")}
        description={state?.url ?? "使用自己的穿透服务器，让手机从外网连接这台电脑。"}
        status={
          <div aria-live="polite" className="space-y-1">
            {state ? (
              <p className={state.status === "error" ? "text-destructive" : undefined}>
                {STATUS_LABELS[state.status]}
              </p>
            ) : readError === null ? (
              <p>正在读取…</p>
            ) : null}
            {state?.message ? <p>{state.message}</p> : null}
            {readError ? <p className="text-destructive">{readError}</p> : null}
            {managed ? <p>{managed}</p> : null}
          </div>
        }
        control={
          <div className="flex flex-wrap items-center gap-2">
            {canPair ? (
              <Button size="xs" onClick={() => void openPairing()}>
                手机扫码配对
              </Button>
            ) : null}
            <Button
              size="xs"
              variant="outline"
              disabled={managed !== undefined}
              onClick={() => {
                setUrlInput(state?.url ?? "");
                setDialog("configure");
              }}
            >
              {configured ? "修改配置" : "配置穿透"}
            </Button>
            {configured ? (
              <Button size="xs" variant="ghost" onClick={() => setDialog("disable")}>
                停用
              </Button>
            ) : null}
          </div>
        }
      />

      <Dialog
        open={dialog === "configure"}
        onOpenChange={(open) => {
          if (!open && !isSaving) closeDialog();
        }}
      >
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>配置 FRP 穿透</DialogTitle>
            <DialogDescription>输入你部署的穿透服务器网址和密钥。</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!isSaving && tunnelOrigin && token && managed === undefined) {
                void save({ url: tunnelOrigin, token });
              }
            }}
          >
            <DialogPanel>
              <div className="space-y-4">
                <label className="block space-y-1.5 text-sm font-medium">
                  <span>穿透服务器网址</span>
                  <Input
                    autoFocus
                    autoComplete="off"
                    disabled={isSaving}
                    inputMode="url"
                    placeholder="https://t3.example.com"
                    value={urlInput}
                    onChange={(event) => setUrlInput(event.target.value)}
                  />
                </label>
                {urlInput.trim() && tunnelOrigin === null ? (
                  <p className="text-xs text-destructive">请输入 HTTPS 域名，可包含端口。</p>
                ) : null}
                <label className="block space-y-1.5 text-sm font-medium">
                  <span>服务器密钥</span>
                  <Input
                    type="password"
                    autoComplete="off"
                    disabled={isSaving}
                    value={tokenInput}
                    onChange={(event) => setTokenInput(event.target.value)}
                  />
                </label>
                {error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : null}
              </div>
            </DialogPanel>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" disabled={isSaving} />}>
                取消
              </DialogClose>
              <Button
                type="submit"
                disabled={isSaving || !tunnelOrigin || !token || managed !== undefined}
              >
                {isSaving ? "正在保存…" : "保存并连接"}
              </Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </Dialog>

      <AlertDialog
        open={dialog === "disable"}
        onOpenChange={(open) => {
          if (!open && !isSaving) closeDialog();
        }}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>停用 FRP 穿透？</AlertDialogTitle>
            <AlertDialogDescription>
              T3 Code 将清除已保存的穿透配置。已配对的手机可在同一地址重新启用后恢复连接。
            </AlertDialogDescription>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" disabled={isSaving} />}>
              取消
            </AlertDialogClose>
            <Button variant="destructive" disabled={isSaving} onClick={() => void save(null)}>
              {isSaving ? "正在停用…" : "停用穿透"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      <Dialog
        open={dialog === "pair"}
        onOpenChange={(open) => {
          if (!open && !isCreatingCode) closeDialog();
        }}
      >
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>手机扫码配对</DialogTitle>
            <DialogDescription>
              在手机 T3 Code 的「设置 → 环境 →
              添加环境」扫码并确认。手机会保留访问权限，你可以在「已授权客户端」中撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            {pairing ? (
              <FrpPhonePairingCode url={pairing.url} credential={pairing.credential} />
            ) : isCreatingCode ? (
              <p role="status">正在生成二维码…</p>
            ) : error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" disabled={isCreatingCode} />}>
              关闭
            </DialogClose>
            <Button disabled={isCreatingCode || !canPair} onClick={() => void openPairing()}>
              重新生成
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
