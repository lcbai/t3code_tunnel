import * as Dialog from "../components/ui/Dialog";
import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult, Atom } from "effect/reactivity";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";

import { environmentPresentations } from "./presentation";
import { useWorkspaceConnectionState, useWorkspaceEnvironments } from "./workspace";
import type { SavedRemoteConnection } from "../lib/connection";
import { appAtomRegistry } from "./atom-registry";
import type { ConnectedEnvironmentSummary, EnvironmentRuntimeState } from "./remote-runtime-types";
import { environmentSession } from "./session";
import { environmentCatalog } from "../connection/catalog";
import { createRemoteEnvironmentProjectionAtoms } from "./remote-environment-projections";
import { serverEnvironment } from "./server";
import {
  connectPairingUrl as connectPairingUrlCommand,
  updateBearerConnection,
} from "../connection/onboarding";
import { useAtomCommand } from "./use-atom-command";

const connectionPairingUrlAtom = Atom.make("").pipe(
  Atom.keepAlive,
  Atom.withLabel("mobile:connection-pairing-url"),
);

const pendingConnectionErrorAtom = Atom.make<string | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("mobile:pending-connection-error"),
);

export function setPendingConnectionError(message: string | null): void {
  appAtomRegistry.set(pendingConnectionErrorAtom, message);
}

export interface PairingOutcome {
  readonly ok: boolean;
  /** Shown beside the pairing form; null when the failure got its own dialog. */
  readonly error: string | null;
}

/** Pairs with the environment behind a pairing link and saves it. */
export async function pairEnvironment(
  pairingUrl: string,
  expectedEnvironmentId?: EnvironmentId,
): Promise<PairingOutcome> {
  const result = await runAtomCommand(
    appAtomRegistry,
    connectPairingUrlCommand,
    { pairingUrl, ...(expectedEnvironmentId === undefined ? {} : { expectedEnvironmentId }) },
    { reportFailure: false },
  );
  if (AsyncResult.isSuccess(result)) {
    appAtomRegistry.set(connectionPairingUrlAtom, "");
    return { ok: true, error: null };
  }
  const error = Cause.squash(result.cause);
  const message = error instanceof Error ? error.message : "与环境配对失败。";
  if (
    error !== null &&
    typeof error === "object" &&
    "reason" in error &&
    error.reason === "unsupported"
  ) {
    Dialog.alert("不支持此客户端", message);
    return { ok: false, error: null };
  }
  return { ok: false, error: message };
}

const remoteEnvironmentProjections = createRemoteEnvironmentProjectionAtoms({
  presentationAtom: environmentPresentations.presentationAtom,
  preparedConnectionAtom: environmentSession.preparedConnectionValueAtom,
  serverConfigAtom: serverEnvironment.configValueAtom,
});

export const environmentConnectedAtom = Atom.family((environmentId: EnvironmentId) =>
  Atom.make(
    (get) =>
      get(remoteEnvironmentProjections.runtimeStateAtom(environmentId))?.connectionState ===
      "connected",
  ).pipe(Atom.withLabel(`mobile:environment-connected:${environmentId}`)),
);

const EMPTY_SAVED_CONNECTION_ATOM = Atom.make<SavedRemoteConnection | null>(null).pipe(
  Atom.withLabel("mobile:saved-connection:empty"),
);

const EMPTY_RUNTIME_STATE_ATOM = Atom.make<EnvironmentRuntimeState | null>(null).pipe(
  Atom.withLabel("mobile:environment-runtime-state:empty"),
);

const savedConnectionsByIdAtom = Atom.make((get) => {
  const catalog = get(environmentCatalog.catalogValueAtom);
  return Object.fromEntries(
    [...catalog.entries.keys()].flatMap((environmentId) => {
      const connection = get(remoteEnvironmentProjections.savedConnectionAtom(environmentId));
      return connection === null ? [] : [[environmentId, connection]];
    }),
  ) as Record<EnvironmentId, SavedRemoteConnection>;
}).pipe(Atom.withLabel("mobile:saved-connections-by-id"));

export function useSavedRemoteConnections() {
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  const savedConnectionsById = useAtomValue(savedConnectionsByIdAtom);

  return {
    isLoadingSavedConnection: !catalog.isReady,
    savedConnectionsById,
  };
}

export function useSavedRemoteConnection(
  environmentId: EnvironmentId | null,
): SavedRemoteConnection | null {
  return useAtomValue(
    environmentId === null
      ? EMPTY_SAVED_CONNECTION_ATOM
      : remoteEnvironmentProjections.savedConnectionAtom(environmentId),
  );
}

export function useRemoteEnvironmentRuntime(
  environmentId: EnvironmentId | null,
): EnvironmentRuntimeState | null {
  return useAtomValue(
    environmentId === null
      ? EMPTY_RUNTIME_STATE_ATOM
      : remoteEnvironmentProjections.runtimeStateAtom(environmentId),
  );
}

export function useRemoteConnectionStatus() {
  const state = useWorkspaceConnectionState();
  const connectedEnvironments: ReadonlyArray<ConnectedEnvironmentSummary> =
    useWorkspaceEnvironments();
  const pendingConnectionError = useAtomValue(pendingConnectionErrorAtom);

  return {
    connectedEnvironments,
    connectionState: state.connectionState,
    connectionError: pendingConnectionError ?? state.connectionError,
  };
}

export function useRemoteConnections() {
  const removeEnvironment = useAtomCommand(environmentCatalog.remove, "移除环境");
  const retryEnvironment = useAtomCommand(environmentCatalog.retryNow, "重新连接环境");
  const setEnvironmentEnabled = useAtomCommand(environmentCatalog.setEnabled, "切换环境");
  const updateEnvironment = useAtomCommand(updateBearerConnection, { reportFailure: false });
  const connectionPairingUrl = useAtomValue(connectionPairingUrlAtom);
  const { connectedEnvironments, connectionError, connectionState } = useRemoteConnectionStatus();

  const onChangeConnectionPairingUrl = (pairingUrl: string) => {
    appAtomRegistry.set(connectionPairingUrlAtom, pairingUrl);
  };

  const onConnectPress = (pairingUrl?: string, expectedEnvironmentId?: EnvironmentId) =>
    pairEnvironment(pairingUrl ?? connectionPairingUrl, expectedEnvironmentId);

  const onReconnectEnvironment = (environmentId: EnvironmentId) => retryEnvironment(environmentId);
  const onSetEnvironmentEnabled = (environmentId: EnvironmentId, enabled: boolean) =>
    setEnvironmentEnabled({ environmentId, enabled });
  const onUpdateEnvironment = (
    environmentId: EnvironmentId,
    updates: { readonly label: string; readonly displayUrl: string },
  ) => updateEnvironment({ environmentId, label: updates.label, httpBaseUrl: updates.displayUrl });

  const onRemoveEnvironmentPress = (environmentId: EnvironmentId) => {
    const environment = connectedEnvironments.find(
      (candidate) => candidate.environmentId === environmentId,
    );
    if (!environment) {
      return;
    }
    const remove = {
      text: "移除",
      style: "destructive",
      onPress: () => {
        void removeEnvironment(environmentId);
      },
    } as const;
    Dialog.alert(
      "从此设备移除？",
      `这会移除此设备上的 ${environment.environmentLabel} 及其会话缓存。如需保留，可关闭此连接。`,
      [{ text: "取消", style: "cancel" }, remove],
    );
  };

  return {
    connectionPairingUrl,
    connectionState,
    connectionError,
    connectedEnvironments,
    connectedEnvironmentCount: connectedEnvironments.length,
    onChangeConnectionPairingUrl,
    onConnectPress,
    onReconnectEnvironment,
    onSetEnvironmentEnabled,
    onUpdateEnvironment,
    onRemoveEnvironmentPress,
  };
}
