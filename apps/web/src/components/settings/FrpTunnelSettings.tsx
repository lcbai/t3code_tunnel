import { msg, useGT, useMessages } from "gt-react";
import { useState } from "react";
import {
  AuthEnvironmentMaintainScope,
  type DesktopBridge,
  type DesktopFrpTunnelState,
  type EnvironmentId,
} from "@t3tools/contracts";

import { refreshDesktopFrpTunnelState } from "~/state/desktopFrpTunnel";
import { readEnvironmentScope } from "~/state/session";
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
import { SettingsRow } from "./settingsLayout";
import { useSearchableSetting } from "./settingsSearch";

const STATUS_LABELS = {
  disabled: msg("Disabled"),
  connecting: msg("Connecting…"),
  connected: msg("Connected"),
  error: msg("Failed"),
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

export function FrpTunnelSettings({
  bridge,
  state,
  readError,
  environmentId,
  managed,
}: {
  readonly bridge: Pick<DesktopBridge, "setFrpTunnel">;
  readonly state: DesktopFrpTunnelState | null;
  readonly readError: string | null;
  readonly environmentId: EnvironmentId;
  readonly managed?: string | undefined;
}) {
  const gt = useGT();
  const m = useMessages();
  const searchableSetting = useSearchableSetting();
  const [dialog, setDialog] = useState<"configure" | "disable" | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const configured = state?.url != null;
  const tunnelOrigin = normalizeTunnelOrigin(urlInput);
  const token = tokenInput.trim();

  const closeDialog = () => {
    setDialog(null);
    setError(null);
    setTokenInput("");
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
      setError(detail ?? gt("Could not update the FRP tunnel."));
    }
    setIsSaving(false);
  };

  return (
    <>
      <SettingsRow
        {...searchableSetting("frp-tunnel")}
        description={state?.url ?? gt("Connect your phone through your own FRP server.")}
        status={
          <div aria-live="polite" className="space-y-1">
            {state ? (
              <p className={state.status === "error" ? "text-destructive" : undefined}>
                {m(STATUS_LABELS[state.status])}
              </p>
            ) : readError === null ? (
              <p>{gt("Loading…")}</p>
            ) : null}
            {state?.message ? <p>{state.message}</p> : null}
            {readError ? <p className="text-destructive">{readError}</p> : null}
            {managed ? <p>{managed}</p> : null}
          </div>
        }
        control={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="xs"
              variant="outline"
              disabled={managed !== undefined}
              onClick={() => {
                setUrlInput(state?.url ?? "");
                setDialog("configure");
              }}
            >
              {configured ? gt("Edit") : gt("Configure")}
            </Button>
            {configured ? (
              <Button size="xs" variant="ghost" onClick={() => setDialog("disable")}>
                {gt("Disconnect")}
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
            <DialogTitle>{gt("FRP tunnel")}</DialogTitle>
            <DialogDescription>
              {gt("Enter the HTTPS address and token for your FRP server.")}
            </DialogDescription>
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
                  <span>{gt("Server URL")}</span>
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
                  <p className="text-xs text-destructive">
                    {gt("Enter an HTTPS origin, optionally including a port.")}
                  </p>
                ) : null}
                <label className="block space-y-1.5 text-sm font-medium">
                  <span>{gt("Token")}</span>
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
                {gt("Cancel")}
              </DialogClose>
              <Button
                type="submit"
                disabled={isSaving || !tunnelOrigin || !token || managed !== undefined}
              >
                {isSaving ? gt("Saving…") : gt("Connect")}
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
            <AlertDialogTitle>{gt("Disconnect the FRP tunnel?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {gt(
                "This removes the saved tunnel configuration. Paired phones can reconnect when the same address is enabled again.",
              )}
            </AlertDialogDescription>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" disabled={isSaving} />}>
              {gt("Cancel")}
            </AlertDialogClose>
            <Button variant="destructive" disabled={isSaving} onClick={() => void save(null)}>
              {isSaving ? gt("Saving…") : gt("Disconnect")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
