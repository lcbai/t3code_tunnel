import type { DesktopFrpTunnelState } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Atom } from "effect/reactivity";
import { useEffect } from "react";

import { getDocumentActivity, subscribeDocumentReturn } from "~/lib/documentActivity";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { refreshDesktopNetworkAccessState } from "~/state/desktopNetworkAccess";
import { useEnvironmentQuery } from "~/state/query";

class DesktopFrpTunnelStateReadError extends Schema.TaggedError<
  DesktopFrpTunnelStateReadError,
  { readonly brand: unique symbol }
>()("DesktopFrpTunnelStateReadError", { cause: Schema.Defect() }) {
  override get message(): string {
    return "无法读取 FRP 穿透状态。";
  }
}

const frpTunnelStateAtom = Atom.make(
  Effect.tryPromise({
    try: (): Promise<DesktopFrpTunnelState> => window.desktopBridge!.getFrpTunnelState(),
    catch: (cause) => new DesktopFrpTunnelStateReadError({ cause }),
  }),
).pipe(Atom.withLabel("desktop:frp-tunnel"));

export function refreshDesktopFrpTunnelState(): void {
  appAtomRegistry.refresh(frpTunnelStateAtom);
}

export function useDesktopFrpTunnelState(enabled: boolean) {
  const query = useEnvironmentQuery(enabled ? frpTunnelStateAtom : null);
  const connectedUrl = query.data?.status === "connected" ? query.data.url : null;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reads the desktop tunnel status while the settings window is visible
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => {
      if (getDocumentActivity().visible) refreshDesktopFrpTunnelState();
    }, 5_000);
    const unsubscribe = subscribeDocumentReturn(refreshDesktopFrpTunnelState);
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [enabled]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- reloads the desktop's advertised endpoints when the verified tunnel origin changes
  useEffect(() => {
    if (enabled && connectedUrl !== null) refreshDesktopNetworkAccessState();
  }, [enabled, connectedUrl]);

  return query;
}
