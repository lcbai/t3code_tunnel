import { SessionPermissions } from "./SessionPermissions";
import { useSearch } from "@tanstack/react-router";
import { ChevronRightIcon, EllipsisIcon } from "lucide-react";
import { useAtomValue } from "@effect/atom-react";
import { type ReactNode, useState } from "react";
import {
  AuthAccessReadScope,
  AuthAccessWriteScope,
  AuthEnvironmentMaintainScope,
  type AuthClientSession,
  type AuthPairingLink,
  type AuthPairingCredentialResult,
  type AdvertisedEndpoint,
  type DesktopServerExposureState,
  type DesktopWslState,
  EnvironmentId,
  managedCapabilityDenial,
  resolveEnvironmentMachineKind,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import * as Cause from "effect/Cause";

import { isLocalEnvironmentDisabled } from "../../localEnvironment";
import {
  applyWslEnableSelection,
  isWslSettingsRowVisible,
  missingTailscaleEndpointDescription,
  resolveLocalVersionStatusLabel,
  resolveTailscaleServeBaseUrl,
} from "./ConnectionsSettings.logic";
import { settingsScopeEnvironmentLabel } from "./settingsScopeAxis";
import { useAccessEnvironment } from "./useAccessEnvironment";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { ManagedByOrganization } from "../ManagedPolicy";
import { LocalEnvironmentSetting } from "./LocalEnvironmentSetting";
import { searchableSetting } from "./settingsSearch";
import { EnvironmentIconMenu } from "./EnvironmentIconPicker";
import { FoldedSettingsSection } from "./FoldedSettingsSection";
import { LinkedEnvironmentsSettings } from "./LinkedEnvironmentsSettings";
import { usePeerLinkHosts } from "~/state/peerLinks";
import { LoadBalancingSettings } from "./LoadBalancingSettings";
import { PullRequestRoutingSettings } from "./PullRequestRoutingSettings";
import { Input } from "../ui/input";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { ScrollArea } from "../ui/scroll-area";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Spinner } from "../ui/spinner";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Menu, MenuPopup, MenuTrigger } from "../ui/menu";
import { Switch } from "../ui/switch";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Button } from "../ui/button";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { type ServerClientSessionRecord } from "~/environments/primary";
import { isDesktopLocalConnectionTarget } from "~/connection/desktopLocal";
import { useUiStateStore } from "~/uiStateStore";
import {
  resolveServerConfigVersionMismatch,
  resolveServerSelfUpdateCapability,
  supportsDesktopAppUpdate,
} from "~/versionSkew";
import { authEnvironment } from "~/state/auth";
import { environmentCatalog } from "~/connection/catalog";
import {
  readEnvironmentScope,
  useEnvironmentScope,
  useEnvironmentSessionState,
} from "~/state/session";
import { useEnvironmentQuery } from "~/state/query";
import {
  desktopNetworkAccessStateAtom,
  refreshDesktopNetworkAccessState,
} from "~/state/desktopNetworkAccess";
import { desktopWslStateAtom, refreshDesktopWslState } from "~/state/desktopWslState";
import { useDesktopUpdateState } from "~/state/desktopUpdate";
import {
  type EnvironmentPresentation,
  useEnvironment,
  useEnvironments,
  usePrimaryEnvironment,
} from "~/state/environments";
import { requestConfirmDialog } from "~/confirmDialog";
import { useAtomCommand } from "../../state/use-atom-command";
import { environmentIdsKey } from "~/state/environmentAtomList";
import { environmentUpdateStatesAtom, serverEnvironment } from "~/state/server";
import {
  ServerUpdateAction,
  ServerUpdateProgress,
  ServerUpdatesAction,
  type ServerUpdateTarget,
} from "../ServerUpdateAction";
import {
  sortDesktopPairingLinks,
  summarizeAuthorizedClients,
  sortDesktopClientSessions,
  toDesktopPairingLinkRecord,
  toDesktopClientSessionRecord,
  selectPairingEndpoint,
  isTailscaleHttpsEndpoint,
  endpointDefaultPreferenceKey,
} from "./ConnectionsSettings.logic";
import {
  AdvertisedEndpointListRow,
  AuthorizedClientsHeaderAction,
  NetworkAccessDescription,
  PairingClientsList,
} from "./AuthorizedClientsSettings";
import { ITEM_ROW_CLASSNAME } from "./itemRows";
import { EmptyRemoteEnvironments, SavedBackendListRow } from "./SavedEnvironmentRows";
import { AddEnvironmentDialog } from "./AddEnvironmentDialog";

const DEFAULT_TAILSCALE_SERVE_PORT = 443;
const EMPTY_ADVERTISED_ENDPOINTS: ReadonlyArray<AdvertisedEndpoint> = [];

// Colons are invalid in distro names, keeping picker sentinels collision-free.
const BACKEND_VALUE_DEFAULT_WSL = "backend:default-wsl";
const BACKEND_VALUE_WSL_OFF = "backend:wsl-off";

// Subscribes on its own so desktop download progress does not re-render the page.
function LocalVersionStatusLabel() {
  const updateState = useDesktopUpdateState();
  return (
    <span className="text-xs text-muted-foreground">
      {resolveLocalVersionStatusLabel(updateState)}
    </span>
  );
}

/** Environments lists the machines this app connects to; access covers who may reach one of them. */
export function ConnectionsSettings({ view }: { readonly view: "environments" | "access" }) {
  return view === "access" ? (
    <AccessSettings />
  ) : (
    <ConnectionsSettingsContent view="environments" accessEnvironmentId={null} />
  );
}

function AccessSettings() {
  // A link that names an environment, such as the MCP wizard's, opens the page on it. The
  // settings layout remounts this page when the link changes.
  const linkedEnvironmentId = useSearch({
    strict: false,
    select: (search) =>
      typeof search.machine === "string" ? EnvironmentId.make(search.machine) : null,
  });
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState(linkedEnvironmentId);
  const { candidates, environment: accessEnvironment } =
    useAccessEnvironment(selectedEnvironmentId);
  const accessEnvironmentId = accessEnvironment?.environmentId ?? null;
  const picker =
    candidates.length > 1 && accessEnvironmentId !== null ? (
      <div className="flex min-w-0 items-center gap-1.5 px-3 text-sm text-muted-foreground sm:px-4">
        <span className="shrink-0">显示访问权限</span>
        <Select
          value={accessEnvironmentId}
          onValueChange={(next) => {
            if (next !== null) setSelectedEnvironmentId(next);
          }}
        >
          <SelectTrigger size="sm" className="w-auto max-w-72" aria-label="环境">
            <SelectValue>
              {(value: EnvironmentId) => {
                const environment = candidates.find(
                  (candidate) => candidate.environmentId === value,
                );
                return environment ? settingsScopeEnvironmentLabel(environment, candidates) : null;
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup alignItemWithTrigger={false}>
            {candidates.map((environment) => (
              <SelectItem
                hideIndicator
                key={environment.environmentId}
                value={environment.environmentId}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <EnvironmentMachineIcon
                    aria-hidden
                    kind={resolveEnvironmentMachineKind(environment.serverConfig)}
                    className="size-3.5 shrink-0"
                  />
                  <span className="min-w-0 truncate">
                    {settingsScopeEnvironmentLabel(environment, candidates)}
                  </span>
                  {environment.connection.phase !== "connected" ? (
                    <span className="shrink-0 text-xs text-muted-foreground">离线</span>
                  ) : null}
                </span>
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>
    ) : null;
  // Keyed so pairing credentials and pending work never carry over to another environment.
  return (
    <ConnectionsSettingsContent
      key={accessEnvironmentId ?? "none"}
      view="access"
      accessEnvironmentId={accessEnvironmentId}
      accessEnvironmentPicker={picker}
    />
  );
}

function ConnectionsSettingsContent({
  view,
  accessEnvironmentId,
  accessEnvironmentPicker = null,
}: {
  readonly view: "environments" | "access";
  readonly accessEnvironmentId: EnvironmentId | null;
  readonly accessEnvironmentPicker?: ReactNode;
}) {
  const desktopBridge = window.desktopBridge;
  const { environments } = useEnvironments();
  const primaryEnvironment = usePrimaryEnvironment();
  const peerLinkHosts = usePeerLinkHosts();
  const removeEnvironment = useAtomCommand(environmentCatalog.remove, { reportFailure: false });
  const setEnvironmentEnabled = useAtomCommand(environmentCatalog.setEnabled, {
    reportFailure: false,
  });
  const primaryEnvironmentId = primaryEnvironment?.environmentId ?? null;
  const accessEnvironment = useEnvironment(accessEnvironmentId);
  // Desktop network, Tailscale, and WSL controls change the backend this app spawned.
  const isPrimaryAccess =
    accessEnvironmentId !== null && accessEnvironmentId === primaryEnvironmentId;
  const accessSessionState = useEnvironmentSessionState(accessEnvironmentId);
  const currentSessionScopes = accessSessionState.data?.authenticated
    ? (accessSessionState.data.permissions ?? accessSessionState.data.scopes ?? null)
    : null;
  const currentAuthPolicy = desktopBridge ? null : (accessSessionState.data?.auth.policy ?? null);
  const savedEnvironments = environments.filter(
    (environment) => environment.entry.target._tag !== "PrimaryConnectionTarget",
  );
  const listedEnvironments = savedEnvironments.filter(
    (environment) => !isDesktopLocalConnectionTarget(environment.entry.target),
  );
  const savedUpdateStates = useAtomValue(
    environmentUpdateStatesAtom(
      environmentIdsKey(savedEnvironments.map(({ environmentId }) => environmentId)),
    ),
  );
  const savedServerUpdateStates = savedEnvironments.map((environment, index) => ({
    environment,
    updateStatus: savedUpdateStates[index]!.status,
  }));
  const savedServerUpdateTargets = savedServerUpdateStates.flatMap(
    ({ environment, updateStatus }): ServerUpdateTarget[] => {
      const mismatch = resolveServerConfigVersionMismatch(environment.serverConfig);
      const selfUpdate = resolveServerSelfUpdateCapability(environment.serverConfig);
      const desktopAppUpdate = supportsDesktopAppUpdate(environment.serverConfig);
      if (
        !mismatch ||
        updateStatus === "running" ||
        !environment.entry.enabled ||
        environment.connection.phase !== "connected" ||
        isDesktopLocalConnectionTarget(environment.entry.target) ||
        selfUpdate === null ||
        (selfUpdate === "desktop-managed" && !desktopAppUpdate)
      ) {
        return [];
      }
      return [
        {
          environmentId: environment.environmentId,
          serverLabel: environment.label,
          selfUpdate,
          installation: environment.serverConfig?.environment.capabilities.serverInstallation,
          desktopAppUpdate,
          targetVersion: mismatch.clientVersion,
        },
      ];
    },
  );
  const loadBalancingEnvironments = [
    ...(primaryEnvironment ? [primaryEnvironment] : []),
    ...savedEnvironments.filter((environment) => environment.entry.enabled),
  ].filter((environment) => environment.connection.phase !== "unsupported");
  const [desktopServerExposureMutationError, setDesktopServerExposureMutationError] = useState<
    string | null
  >(null);
  const [desktopAccessManagementMutationError, setDesktopAccessManagementMutationError] = useState<
    string | null
  >(null);
  const [createdPairingCredentials, setCreatedPairingCredentials] = useState<
    ReadonlyMap<string, string>
  >(() => new Map());
  const [newestPairingLinkId, setNewestPairingLinkId] = useState<string | null>(null);
  const handlePairingLinkCreated = (created: AuthPairingCredentialResult) => {
    setCreatedPairingCredentials((current) => new Map(current).set(created.id, created.credential));
    setNewestPairingLinkId(created.id);
  };
  const [revokingDesktopPairingLinkId, setRevokingDesktopPairingLinkId] = useState<string | null>(
    null,
  );
  const [revokingDesktopClientSessionId, setRevokingDesktopClientSessionId] = useState<
    string | null
  >(null);
  const [isRevokingOtherDesktopClients, setIsRevokingOtherDesktopClients] = useState(false);
  const [addBackendDialogOpen, setAddBackendDialogOpen] = useState(false);
  const [routeTarget, setRouteTarget] = useState<EnvironmentPresentation | null>(null);
  const [savedBackendError, setSavedBackendError] = useState<string | null>(null);
  const handleAddBackendDialogOpenChange = (open: boolean) => {
    setAddBackendDialogOpen(open);
    if (open) {
      setRouteTarget(null);
    } else {
      setSavedBackendError(null);
    }
  };
  const [removingSavedEnvironmentId, setRemovingSavedEnvironmentId] =
    useState<EnvironmentId | null>(null);
  const [isUpdatingDesktopServerExposure, setIsUpdatingDesktopServerExposure] = useState(false);
  const [isUpdatingTailscaleServe, setIsUpdatingTailscaleServe] = useState(false);
  const [isUpdatingWslBackend, setIsUpdatingWslBackend] = useState(false);
  const [desktopWslMutationError, setDesktopWslMutationError] = useState<string | null>(null);
  type PendingWslChange =
    | { readonly kind: "disable"; readonly wasWslOnly: boolean }
    | { readonly kind: "distro"; readonly nextDistro: string | null }
    | { readonly kind: "enable"; readonly nextDistro: string | null }
    | { readonly kind: "wsl-only"; readonly nextValue: boolean };
  const [pendingWslChange, setPendingWslChange] = useState<PendingWslChange | null>(null);
  const isWslConfirmDialogOpen = pendingWslChange !== null;
  const [pendingTailscaleServeEndpoint, setPendingTailscaleServeEndpoint] =
    useState<AdvertisedEndpoint | null>(null);
  const [disableTailscaleServeDialogOpen, setDisableTailscaleServeDialogOpen] = useState(false);
  const [tailscaleServePortInput, setTailscaleServePortInput] = useState(
    String(DEFAULT_TAILSCALE_SERVE_PORT),
  );
  const [pendingDesktopServerExposureMode, setPendingDesktopServerExposureMode] = useState<
    DesktopServerExposureState["mode"] | null
  >(null);
  const primaryServerConfig = primaryEnvironment?.serverConfig ?? null;
  // Turning remote access off stays possible; only the way in is managed.
  const remoteClientsDenial = managedCapabilityDenial(
    primaryServerConfig?.managedPolicy,
    "remoteClients",
  );
  const primaryVersionMismatch = resolveServerConfigVersionMismatch(primaryServerConfig);
  const primaryServerUpdateState = useAtomValue(
    serverEnvironment.updateStateAtom(primaryEnvironmentId),
  );
  const [isAdvertisedEndpointListExpanded, setIsAdvertisedEndpointListExpanded] = useState(false);
  const defaultAdvertisedEndpointKey = useUiStateStore(
    (state) => state.defaultAdvertisedEndpointKey,
  );
  const setDefaultAdvertisedEndpointKey = useUiStateStore(
    (state) => state.setDefaultAdvertisedEndpointKey,
  );
  const canReadAccess = useEnvironmentScope(accessEnvironmentId, AuthAccessReadScope);
  const canWriteAccess = useEnvironmentScope(accessEnvironmentId, AuthAccessWriteScope);
  const canMaintain = useEnvironmentScope(accessEnvironmentId, AuthEnvironmentMaintainScope);
  const canManageLocalBackend = isPrimaryAccess && !isLocalEnvironmentDisabled() && canMaintain;
  const showsAccess = view === "access";
  const authAccessChanges = useEnvironmentQuery(
    showsAccess && canReadAccess && accessEnvironmentId !== null
      ? authEnvironment.accessChanges({
          environmentId: accessEnvironmentId,
          input: null,
        })
      : null,
  );
  const revokePairingLink = useAtomCommand(authEnvironment.revokePairingLink, {
    reportFailure: false,
  });
  const revokeClient = useAtomCommand(authEnvironment.revokeClient, { reportFailure: false });
  const revokeOtherClients = useAtomCommand(authEnvironment.revokeOtherClients, {
    reportFailure: false,
  });
  const desktopNetworkAccess = useEnvironmentQuery(
    showsAccess && canManageLocalBackend && desktopBridge ? desktopNetworkAccessStateAtom : null,
  );
  const desktopWsl = useEnvironmentQuery(
    showsAccess && canManageLocalBackend && desktopBridge ? desktopWslStateAtom : null,
  );
  const desktopWslState = desktopWsl.data;
  const desktopWslError = desktopWslMutationError ?? desktopWsl.error;
  const isLoadingWslState = desktopWsl.isPending && desktopWsl.data === null;
  const desktopServerExposureState = desktopNetworkAccess.data?.serverExposureState ?? null;
  const desktopAdvertisedEndpoints =
    desktopNetworkAccess.data?.advertisedEndpoints ?? EMPTY_ADVERTISED_ENDPOINTS;
  const desktopServerExposureError =
    desktopServerExposureMutationError ?? desktopNetworkAccess.error;
  const desktopAccessManagementError =
    desktopAccessManagementMutationError ?? authAccessChanges.error;
  const isLoadingDesktopAccessManagement =
    authAccessChanges.isPending && authAccessChanges.data === null;
  const desktopPairingLinks = (() => {
    const event = authAccessChanges.data;
    if (event?.type !== "snapshot") return [];
    return sortDesktopPairingLinks(
      event.payload.pairingLinks.map((pairingLink: AuthPairingLink) =>
        toDesktopPairingLinkRecord(pairingLink),
      ),
    );
  })();
  const desktopClientSessions = (() => {
    const event = authAccessChanges.data;
    if (event?.type !== "snapshot") return [];
    return sortDesktopClientSessions(
      event.payload.clientSessions.map((clientSession: AuthClientSession) =>
        toDesktopClientSessionRecord(clientSession),
      ),
    );
  })();
  const isLocalBackendNetworkAccessible = desktopBridge
    ? desktopServerExposureState?.mode === "network-accessible"
    : currentAuthPolicy === "remote-reachable";
  const trimmedTailscaleServePortInput = tailscaleServePortInput.trim();
  const parsedTailscaleServePort = Number(trimmedTailscaleServePortInput);
  const isTailscaleServePortValid =
    /^\d+$/u.test(trimmedTailscaleServePortInput) &&
    Number.isInteger(parsedTailscaleServePort) &&
    parsedTailscaleServePort >= 1 &&
    parsedTailscaleServePort <= 65_535;

  const pendingTailscaleServeBaseUrl = resolveTailscaleServeBaseUrl(
    pendingTailscaleServeEndpoint,
    parsedTailscaleServePort,
    isTailscaleServePortValid,
  );

  const handleDesktopServerExposureChange = async (checked: boolean) => {
    if (
      !desktopBridge ||
      primaryEnvironmentId === null ||
      !readEnvironmentScope(primaryEnvironmentId, AuthEnvironmentMaintainScope)
    )
      return;
    setIsUpdatingDesktopServerExposure(true);
    setDesktopServerExposureMutationError(null);
    try {
      await desktopBridge.setServerExposureMode(checked ? "network-accessible" : "local-only");
      refreshDesktopNetworkAccessState();
      setPendingDesktopServerExposureMode(null);
      setIsUpdatingDesktopServerExposure(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update network exposure.";
      setPendingDesktopServerExposureMode(null);
      setDesktopServerExposureMutationError(message);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "无法更新网络访问",
          description: message,
        }),
      );
      setIsUpdatingDesktopServerExposure(false);
    }
  };

  const handleConfirmDesktopServerExposureChange = () => {
    if (pendingDesktopServerExposureMode === null) return;
    const checked = pendingDesktopServerExposureMode === "network-accessible";
    void handleDesktopServerExposureChange(checked);
  };

  const handleConfirmTailscaleServeSetup = async () => {
    if (
      !desktopBridge ||
      primaryEnvironmentId === null ||
      !readEnvironmentScope(primaryEnvironmentId, AuthEnvironmentMaintainScope)
    )
      return;
    if (!isTailscaleServePortValid) return;
    setIsUpdatingTailscaleServe(true);
    setDesktopServerExposureMutationError(null);
    const settled = await settlePromise(async () => {
      await desktopBridge.setTailscaleServeEnabled({
        enabled: true,
        port: parsedTailscaleServePort,
      });
      refreshDesktopNetworkAccessState();
      setPendingTailscaleServeEndpoint(null);
    });
    if (settled._tag === "Failure") {
      const error = Cause.squash(settled.cause);
      const message =
        error instanceof Error ? error.message : "Failed to configure Tailscale HTTPS.";
      setDesktopServerExposureMutationError(message);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not set up Tailscale HTTPS",
          description: message,
        }),
      );
    }
    setIsUpdatingTailscaleServe(false);
  };

  const handleStartTailscaleServeSetup = (endpoint: AdvertisedEndpoint) => {
    setTailscaleServePortInput(
      String(desktopServerExposureState?.tailscaleServePort ?? DEFAULT_TAILSCALE_SERVE_PORT),
    );
    setPendingTailscaleServeEndpoint(endpoint);
  };

  const handleConfirmTailscaleServeDisable = async () => {
    if (
      !desktopBridge ||
      primaryEnvironmentId === null ||
      !readEnvironmentScope(primaryEnvironmentId, AuthEnvironmentMaintainScope)
    )
      return;
    setIsUpdatingTailscaleServe(true);
    setDesktopServerExposureMutationError(null);
    const settled = await settlePromise(async () => {
      await desktopBridge.setTailscaleServeEnabled({
        enabled: false,
        port: desktopServerExposureState?.tailscaleServePort ?? DEFAULT_TAILSCALE_SERVE_PORT,
      });
      refreshDesktopNetworkAccessState();
      setDisableTailscaleServeDialogOpen(false);
    });
    if (settled._tag === "Failure") {
      const error = Cause.squash(settled.cause);
      const message = error instanceof Error ? error.message : "Failed to disable Tailscale HTTPS.";
      setDesktopServerExposureMutationError(message);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Could not disable Tailscale HTTPS",
          description: message,
        }),
      );
    }
    setIsUpdatingTailscaleServe(false);
  };

  const handleStartTailscaleServeDisable = (_endpoint: AdvertisedEndpoint) => {
    setDisableTailscaleServeDialogOpen(true);
  };

  const handleRevokeDesktopPairingLink = async (id: string) => {
    if (
      accessEnvironmentId === null ||
      !readEnvironmentScope(accessEnvironmentId, AuthAccessWriteScope)
    )
      return;
    setRevokingDesktopPairingLinkId(id);
    setDesktopAccessManagementMutationError(null);
    const result = await revokePairingLink({ environmentId: accessEnvironmentId, input: { id } });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      const message = error instanceof Error ? error.message : "Failed to revoke pairing link.";
      setDesktopAccessManagementMutationError(message);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "无法取消配对链接",
          description: message,
        }),
      );
    }
    setRevokingDesktopPairingLinkId(null);
  };

  const handleRevokeDesktopClientSession = async (
    sessionId: ServerClientSessionRecord["sessionId"],
  ) => {
    if (
      accessEnvironmentId === null ||
      !readEnvironmentScope(accessEnvironmentId, AuthAccessWriteScope)
    )
      return;
    setRevokingDesktopClientSessionId(sessionId);
    setDesktopAccessManagementMutationError(null);
    const result = await revokeClient({ environmentId: accessEnvironmentId, input: { sessionId } });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      const message = error instanceof Error ? error.message : "Failed to revoke client access.";
      setDesktopAccessManagementMutationError(message);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "无法取消客户端访问",
          description: message,
        }),
      );
    }
    setRevokingDesktopClientSessionId(null);
  };

  const handleRevokeOtherDesktopClients = async () => {
    if (
      accessEnvironmentId === null ||
      !readEnvironmentScope(accessEnvironmentId, AuthAccessWriteScope)
    )
      return;
    setIsRevokingOtherDesktopClients(true);
    setDesktopAccessManagementMutationError(null);
    const result = await revokeOtherClients({ environmentId: accessEnvironmentId, input: null });
    if (result._tag === "Success") {
      toastManager.add({
        type: "success",
        title: result.value === 1 ? "撤销了 1 个其他客户端" : `已撤销的${result.value} 客户端`,
        description: "其他配对客户端在重新连接之前需要一个新的配对链接。",
      });
    } else if (!isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      const message = error instanceof Error ? error.message : "Failed to revoke other clients.";
      setDesktopAccessManagementMutationError(message);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "无法撤销其他客户端",
          description: message,
        }),
      );
    }
    setIsRevokingOtherDesktopClients(false);
  };

  const handleSetSavedBackendEnabled = async (environmentId: EnvironmentId, enabled: boolean) => {
    setSavedBackendError(null);
    const result = await setEnvironmentEnabled({ environmentId, enabled });
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      const message =
        error instanceof Error
          ? error.message
          : `Failed to switch the backend ${enabled ? "on" : "off"}.`;
      setSavedBackendError(message);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: `无法${enabled ? "开启" : "关闭"}后端`,
          description: message,
        }),
      );
    }
  };

  const removeSavedBackend = async (environment: EnvironmentPresentation) => {
    const environmentId = environment.environmentId;
    setRemovingSavedEnvironmentId(environmentId);
    setSavedBackendError(null);
    const result = await removeEnvironment(environmentId);
    setRemovingSavedEnvironmentId(null);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      const message = error instanceof Error ? error.message : "Failed to remove backend.";
      setSavedBackendError(message);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "无法删除后端",
          description: message,
        }),
      );
    }
  };

  const handleRemoveSavedBackend = async (environment: EnvironmentPresentation) => {
    const confirmed = await requestConfirmDialog(
      `从此设备移除 ${environment.label} 吗？\n此设备上的配对信息、凭据和缓存会话将被清除。要保留这些数据，可以关闭连接。`,
      { variant: "destructive" },
    );
    if (confirmed === true) await removeSavedBackend(environment);
  };

  const visibleDesktopPairingLinks = desktopPairingLinks;
  const tailscaleHttpsEndpoint = desktopAdvertisedEndpoints.find(isTailscaleHttpsEndpoint) ?? null;
  const visibleDesktopNetworkAdvertisedEndpoints = isLocalBackendNetworkAccessible
    ? desktopAdvertisedEndpoints.filter((endpoint) => !isTailscaleHttpsEndpoint(endpoint))
    : [];
  const visibleDesktopAdvertisedEndpoints = tailscaleHttpsEndpoint
    ? [...visibleDesktopNetworkAdvertisedEndpoints, tailscaleHttpsEndpoint]
    : visibleDesktopNetworkAdvertisedEndpoints;
  const defaultDesktopNetworkAdvertisedEndpoint = selectPairingEndpoint(
    visibleDesktopNetworkAdvertisedEndpoints,
    defaultAdvertisedEndpointKey,
  );
  const defaultDesktopAdvertisedEndpoint =
    defaultDesktopNetworkAdvertisedEndpoint ??
    selectPairingEndpoint(
      tailscaleHttpsEndpoint ? [tailscaleHttpsEndpoint] : [],
      defaultAdvertisedEndpointKey,
    );
  const defaultDesktopAdvertisedEndpointKey = defaultDesktopAdvertisedEndpoint
    ? endpointDefaultPreferenceKey(defaultDesktopAdvertisedEndpoint)
    : null;
  const handleSetDefaultAdvertisedEndpoint = (endpoint: AdvertisedEndpoint) => {
    setDefaultAdvertisedEndpointKey(endpointDefaultPreferenceKey(endpoint));
  };

  const renderNetworkAccessToggle = () => (
    <Switch
      checked={desktopServerExposureState?.mode === "network-accessible"}
      disabled={!desktopServerExposureState || isUpdatingDesktopServerExposure}
      onCheckedChange={(checked) => {
        setPendingDesktopServerExposureMode(checked ? "network-accessible" : "local-only");
      }}
      aria-label="启用网络访问"
    />
  );
  const renderEndpointRows = () =>
    isAdvertisedEndpointListExpanded
      ? visibleDesktopNetworkAdvertisedEndpoints.map((endpoint) => {
          const endpointKey = endpointDefaultPreferenceKey(endpoint);
          return (
            <AdvertisedEndpointListRow
              key={endpoint.id}
              endpoint={endpoint}
              isDefault={endpointKey === defaultDesktopAdvertisedEndpointKey}
              onSetDefault={handleSetDefaultAdvertisedEndpoint}
              onSetupTailscaleServe={handleStartTailscaleServeSetup}
              onDisableTailscaleServe={handleStartTailscaleServeDisable}
              isUpdatingTailscaleServe={isUpdatingTailscaleServe}
            />
          );
        })
      : null;
  const applyWslSettingChange = async (apply: () => Promise<DesktopWslState>) => {
    if (
      !desktopBridge ||
      primaryEnvironmentId === null ||
      !readEnvironmentScope(primaryEnvironmentId, AuthEnvironmentMaintainScope)
    )
      return;
    setIsUpdatingWslBackend(true);
    setDesktopWslMutationError(null);
    const settled = await settlePromise(async () => {
      await apply();
      refreshDesktopWslState();
    });
    if (settled._tag === "Failure") {
      const error = Cause.squash(settled.cause);
      const message = error instanceof Error ? error.message : "Failed to update WSL backend.";
      setDesktopWslMutationError(message);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "无法更改WSL 后端",
          description: message,
        }),
      );
      refreshDesktopWslState();
    }
    setIsUpdatingWslBackend(false);
  };

  const loadWslState = () => {
    setDesktopWslMutationError(null);
    refreshDesktopWslState();
  };

  const hasWslRegistrationToLose = environments.some((environment) =>
    isDesktopLocalConnectionTarget(environment.entry.target),
  );

  const handleSelectWslMode = (value: string) => {
    if (!desktopBridge || !desktopWslState) return;
    const defaultDistroName =
      desktopWslState.distros.find((distro) => distro.isDefault)?.name ?? null;
    if (value === BACKEND_VALUE_WSL_OFF) {
      // Unavailable WSL can remain wslOnly while disabled; switching to Windows must clear both.
      if (!desktopWslState.enabled && !desktopWslState.wslOnly) return;
      const wasWslOnly = desktopWslState.wslOnly;
      if (hasWslRegistrationToLose || wasWslOnly) {
        setPendingWslChange({ kind: "disable", wasWslOnly });
        return;
      }
      void applyWslSettingChange(() => desktopBridge.setWslBackendEnabled(false));
      return;
    }
    const nextDistro = value === BACKEND_VALUE_DEFAULT_WSL ? null : value;
    const resolvedNext = nextDistro ?? defaultDistroName;
    if (!desktopWslState.enabled) {
      setPendingWslChange({ kind: "enable", nextDistro });
      return;
    }
    const resolvedCurrent = desktopWslState.distro ?? defaultDistroName;
    if (resolvedCurrent === resolvedNext) return;
    if (hasWslRegistrationToLose || desktopWslState.wslOnly) {
      setPendingWslChange({ kind: "distro", nextDistro });
      return;
    }
    void applyWslSettingChange(() => desktopBridge.setWslDistro(nextDistro));
  };

  const handleConfirmEnableWsl = (mode: "both" | "wsl-only") => {
    if (!desktopBridge || !pendingWslChange || pendingWslChange.kind !== "enable") return;
    const nextDistro = pendingWslChange.nextDistro;
    setPendingWslChange(null);
    const persistedDistro = desktopWslState?.distro ?? null;
    void applyWslSettingChange(() =>
      applyWslEnableSelection({
        bridge: desktopBridge,
        mode,
        nextDistro,
        persistedDistro,
      }),
    );
  };

  const handleToggleWslOnly = (enabled: boolean) => {
    if (!desktopBridge || !desktopWslState || desktopWslState.wslOnly === enabled) return;
    setPendingWslChange({ kind: "wsl-only", nextValue: enabled });
  };

  const handleConfirmWslChange = () => {
    if (!desktopBridge || !pendingWslChange) return;
    const change = pendingWslChange;
    if (change.kind === "enable") return;
    setPendingWslChange(null);
    if (change.kind === "disable") {
      void applyWslSettingChange(async () => {
        const next = await desktopBridge.setWslBackendEnabled(false);
        if (change.wasWslOnly) {
          return await desktopBridge.setWslOnly(false);
        }
        return next;
      });
      return;
    }
    if (change.kind === "distro") {
      void applyWslSettingChange(() => desktopBridge.setWslDistro(change.nextDistro));
      return;
    }
    void applyWslSettingChange(() => desktopBridge.setWslOnly(change.nextValue));
  };

  const renderWslRow = () => {
    if (!desktopWslState) {
      if (
        isWslSettingsRowVisible({ state: null, error: desktopWslError }) &&
        canManageLocalBackend
      ) {
        return (
          <SettingsRow
            {...searchableSetting("wsl-backend")}
            description="无法装入WSL 后端状态。"
            status={<span className="block text-destructive">{desktopWslError}</span>}
            control={
              <Button
                size="sm"
                variant="outline"
                onClick={loadWslState}
                disabled={isLoadingWslState}
              >
                {isLoadingWslState ? "正在重试…" : "重试"}
              </Button>
            }
          />
        );
      }
      return null;
    }
    if (!isWslSettingsRowVisible({ state: desktopWslState, error: desktopWslError })) {
      return null;
    }
    if (!desktopWslState.available) {
      return (
        <SettingsRow
          {...searchableSetting("wsl-backend")}
          description="WSL不可用，因此Windows 正在运行。 关闭WSL 以清除此偏好。"
          status={
            desktopWslError ? (
              <span className="block text-destructive">{desktopWslError}</span>
            ) : null
          }
          control={
            <Button
              size="sm"
              variant="outline"
              disabled={isUpdatingWslBackend}
              onClick={() => handleSelectWslMode(BACKEND_VALUE_WSL_OFF)}
            >
              切换到Windows
            </Button>
          }
        />
      );
    }
    const defaultDistroName =
      desktopWslState.distros.find((distro) => distro.isDefault)?.name ?? null;
    const selectValue = !desktopWslState.enabled
      ? BACKEND_VALUE_WSL_OFF
      : (desktopWslState.distro ?? defaultDistroName ?? BACKEND_VALUE_DEFAULT_WSL);
    const selectLabel =
      selectValue === BACKEND_VALUE_WSL_OFF
        ? "关闭"
        : selectValue === BACKEND_VALUE_DEFAULT_WSL
          ? "默认 Distro"
          : selectValue;
    return (
      <>
        <SettingsRow
          {...searchableSetting("wsl-backend")}
          description="运行选中的WSL distro 和Windows. projects 保留在当前的文件系统中。"
          status={
            desktopWslError ? (
              <span className="block text-destructive">{desktopWslError}</span>
            ) : desktopWslState.preflightError ? (
              <span className="block text-destructive">
                WSL 后端无法启动 : {desktopWslState.preflightError}
              </span>
            ) : null
          }
          control={
            <Select
              value={selectValue}
              onValueChange={(value) => {
                if (typeof value !== "string") return;
                handleSelectWslMode(value);
              }}
            >
              <SelectTrigger
                size="sm"
                className="w-full sm:w-56"
                aria-label="WSL 后端"
                disabled={isUpdatingWslBackend}
              >
                <SelectValue>{selectLabel}</SelectValue>
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                <SelectItem hideIndicator value={BACKEND_VALUE_WSL_OFF}>
                  关闭
                </SelectItem>
                {desktopWslState.distros.length === 0 ? (
                  <SelectItem hideIndicator value={BACKEND_VALUE_DEFAULT_WSL}>
                    默认 Distro
                  </SelectItem>
                ) : (
                  desktopWslState.distros.map((distro) => (
                    <SelectItem hideIndicator key={distro.name} value={distro.name}>
                      {distro.name}
                      {distro.isDefault ? " (默认)" : ""}
                    </SelectItem>
                  ))
                )}
              </SelectPopup>
            </Select>
          }
        />
        {desktopWslState.enabled ? (
          <SettingsRow
            title="仅使用 WSL"
            description="仅运行 WSL 后端。更改此设置时，T3 Code 将重启。"
            className="bg-muted/20 pl-7 sm:pl-8"
            control={
              <Switch
                checked={desktopWslState.wslOnly}
                disabled={isUpdatingWslBackend}
                onCheckedChange={(checked) => handleToggleWslOnly(checked)}
                aria-label="只运行WSL"
              />
            }
          />
        ) : null}
      </>
    );
  };

  const renderTailscaleRow = () => (
    <SettingsRow
      title={searchableSetting("tailscale-https").title}
      description={
        tailscaleHttpsEndpoint
          ? tailscaleHttpsEndpoint.status === "available"
            ? tailscaleHttpsEndpoint.httpBaseUrl
            : "使用 Tailscale Serve 通过 MagicDNS HTTPS 地址访问此后端。"
          : missingTailscaleEndpointDescription(desktopServerExposureState)
      }
      control={
        tailscaleHttpsEndpoint ? (
          <Switch
            checked={tailscaleHttpsEndpoint.status === "available"}
            disabled={isUpdatingTailscaleServe}
            onCheckedChange={(checked) => {
              if (checked) {
                handleStartTailscaleServeSetup(tailscaleHttpsEndpoint);
                return;
              }
              handleStartTailscaleServeDisable(tailscaleHttpsEndpoint);
            }}
            aria-label="启用 Tailscale HTTPS"
          />
        ) : null
      }
      managed={tailscaleHttpsEndpoint?.status === "available" ? undefined : remoteClientsDenial}
    />
  );
  const newestPairingLink = visibleDesktopPairingLinks.find(
    (pairingLink) => pairingLink.id === newestPairingLinkId,
  );
  const renderPairingClientsList = (
    pairingLinks: typeof visibleDesktopPairingLinks,
    clientSessions: typeof desktopClientSessions,
  ) => (
    <PairingClientsList
      servedByEnvironment={isPrimaryAccess}
      endpointUrl={desktopServerExposureState?.endpointUrl}
      endpoints={visibleDesktopAdvertisedEndpoints}
      defaultEndpointKey={defaultDesktopAdvertisedEndpointKey}
      isLoading={isLoadingDesktopAccessManagement}
      pairingLinks={pairingLinks}
      createdPairingCredentials={createdPairingCredentials}
      sharedPairingLinkId={newestPairingLinkId}
      clientSessions={clientSessions}
      revokingPairingLinkId={revokingDesktopPairingLinkId}
      revokingClientSessionId={revokingDesktopClientSessionId}
      onRevokePairingLink={handleRevokeDesktopPairingLink}
      onRevokeClientSession={handleRevokeDesktopClientSession}
      canRevoke={canWriteAccess}
    />
  );
  const renderAuthorizedClients = () => (
    <>
      {desktopAccessManagementError ? (
        <div className={ITEM_ROW_CLASSNAME}>
          <p className="text-xs text-destructive">{desktopAccessManagementError}</p>
        </div>
      ) : null}
      {renderPairingClientsList(visibleDesktopPairingLinks, desktopClientSessions)}
    </>
  );
  const renderNetworkAccessRow = () => (
    <SettingsRow
      title={searchableSetting("network-access").title}
      description={
        isLocalBackendNetworkAccessible ? (
          <NetworkAccessDescription
            endpoint={defaultDesktopNetworkAdvertisedEndpoint}
            hiddenEndpointCount={Math.max(visibleDesktopNetworkAdvertisedEndpoints.length - 1, 0)}
            expanded={isAdvertisedEndpointListExpanded}
            onToggleExpanded={() => setIsAdvertisedEndpointListExpanded((expanded) => !expanded)}
            fallback={
              desktopServerExposureState?.endpointUrl
                ? `可在${desktopServerExposureState.endpointUrl} 达到`
                : desktopServerExposureState?.advertisedHost
                  ? `在所有界面上曝光，对齐链接使用${desktopServerExposureState.advertisedHost}。`
                  : "在所有接口上曝光。"
            }
          />
        ) : desktopServerExposureState ? (
          "仅限此机。"
        ) : (
          "正在加载…"
        )
      }
      status={
        desktopServerExposureError ? (
          <span className="block text-destructive">{desktopServerExposureError}</span>
        ) : null
      }
      control={renderNetworkAccessToggle()}
      managed={isLocalBackendNetworkAccessible ? undefined : remoteClientsDenial}
    />
  );
  const renderDisabledNetworkAccessRow = () => (
    <SettingsRow
      title={searchableSetting("network-access").title}
      description={
        desktopBridge
          ? "此连接无法查看或更改网络曝光。"
          : currentAuthPolicy === "remote-reachable"
            ? "远程访问已经配置。 更改服务器启动地点的网络曝光。"
            : currentAuthPolicy === "loopback-browser"
              ? "只有这台机器可以连接。 重新使用一个用于远程对接的非远程对接的主机。"
              : "网络曝光信息不详。"
      }
      control={
        !desktopBridge &&
        (currentAuthPolicy === "remote-reachable" || currentAuthPolicy === "loopback-browser") ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="inline-flex">
                  <Switch
                    checked={isLocalBackendNetworkAccessible}
                    disabled
                    aria-label="启用网络访问"
                  />
                </span>
              }
            />
            <TooltipPopup side="top">
              网络曝光变化重启后端，必须控制服务器进程启动的地方。
            </TooltipPopup>
          </Tooltip>
        ) : undefined
      }
    />
  );

  const accessServerConfig = accessEnvironment?.serverConfig ?? null;
  const primarySettings = (
    <>
      {accessEnvironmentPicker}
      {accessEnvironmentId !== null ? (
        <>
          <SettingsSection
            {...searchableSetting("connections-environment")}
            title={accessEnvironment?.label ?? (desktopBridge ? "本机" : "主要环境")}
            icon={
              <EnvironmentMachineIcon
                aria-hidden
                kind={
                  accessServerConfig ? resolveEnvironmentMachineKind(accessServerConfig) : "desktop"
                }
                className="size-4"
              />
            }
            headerAction={
              accessEnvironmentId !== null ? (
                <Menu>
                  <MenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost-muted"
                        size="icon-xs"
                        aria-label="此机器的更多动作"
                      />
                    }
                  >
                    <EllipsisIcon className="size-3.5" />
                  </MenuTrigger>
                  <MenuPopup align="end">
                    <EnvironmentIconMenu
                      environmentId={accessEnvironmentId}
                      serverConfig={accessServerConfig}
                    />
                  </MenuPopup>
                </Menu>
              ) : null
            }
          >
            {accessServerConfig?.managedPolicy ? (
              <div className="px-3 py-2 sm:px-4">
                <ManagedByOrganization policy={accessServerConfig.managedPolicy} />
              </div>
            ) : null}
            {canManageLocalBackend ? (
              <SettingsRow
                title="版本"
                description={
                  primaryServerUpdateState.status !== "idle" ? (
                    <ServerUpdateProgress state={primaryServerUpdateState} />
                  ) : (
                    [
                      primaryServerConfig?.environment.serverVersion ?? null,
                      primaryEnvironment?.displayUrl ?? null,
                    ]
                      .filter((value): value is string => value !== null)
                      .join(" · ") || "正在加载…"
                  )
                }
                control={
                  primaryVersionMismatch &&
                  primaryEnvironmentId !== null &&
                  primaryServerUpdateState.status !== "running" ? (
                    <ServerUpdateAction
                      size="sm"
                      environmentId={primaryEnvironmentId}
                      serverLabel={
                        primaryEnvironment ? `${primaryEnvironment.label} server` : "server"
                      }
                      selfUpdate={resolveServerSelfUpdateCapability(primaryServerConfig)}
                      installation={
                        primaryServerConfig?.environment.capabilities.serverInstallation
                      }
                      desktopAppUpdate={supportsDesktopAppUpdate(primaryServerConfig)}
                      targetVersion={primaryVersionMismatch.clientVersion}
                      label={
                        primaryServerUpdateState.status === "failed"
                          ? "重试更新"
                          : `更新到${primaryVersionMismatch.clientVersion}`
                      }
                    />
                  ) : primaryServerUpdateState.status === "idle" && primaryServerConfig ? (
                    <LocalVersionStatusLabel />
                  ) : undefined
                }
              />
            ) : null}
            {canManageLocalBackend && desktopBridge ? (
              <>
                {renderNetworkAccessRow()}
                {renderEndpointRows()}
                {renderTailscaleRow()}
                {renderWslRow()}
              </>
            ) : canManageLocalBackend ? (
              renderDisabledNetworkAccessRow()
            ) : null}
            {accessEnvironment ? (
              <details className="group px-3 sm:px-4">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  权限
                  <ChevronRightIcon
                    aria-hidden
                    className="size-3 text-muted-foreground group-open:rotate-90"
                  />
                </summary>
                <SessionPermissions
                  environmentId={accessEnvironment.environmentId}
                  connected={accessEnvironment.connection.phase === "connected"}
                />
              </details>
            ) : null}
          </SettingsSection>

          {canReadAccess || canWriteAccess ? (
            <FoldedSettingsSection
              id="authorized-clients"
              title="已授权客户端"
              collapsedContent={
                canReadAccess && newestPairingLink
                  ? renderPairingClientsList([newestPairingLink], [])
                  : undefined
              }
              summary={summarizeAuthorizedClients(
                desktopClientSessions,
                visibleDesktopPairingLinks,
              )}
              control={
                canWriteAccess ? (
                  <AuthorizedClientsHeaderAction
                    environmentId={accessEnvironmentId}
                    delegatableScopes={currentSessionScopes ?? []}
                    onPairingLinkCreated={handlePairingLinkCreated}
                    clientSessions={
                      canReadAccess &&
                      authAccessChanges.error === null &&
                      authAccessChanges.data?.type === "snapshot"
                        ? desktopClientSessions
                        : null
                    }
                    isRevokingOtherClients={isRevokingOtherDesktopClients}
                    onRevokeOtherClients={handleRevokeOtherDesktopClients}
                  />
                ) : undefined
              }
            >
              <ScrollArea
                scrollFade
                chainVerticalScroll
                className="max-h-[22.5rem]"
                data-testid="authorized-clients-scroll-area"
              >
                {canReadAccess ? (
                  renderAuthorizedClients()
                ) : (
                  <p className="px-4 py-3 text-xs text-muted-foreground">
                    此连接可以创建访问链接，但不能查看授权客户端。
                  </p>
                )}
              </ScrollArea>
            </FoldedSettingsSection>
          ) : null}
          <AlertDialog
            open={pendingDesktopServerExposureMode !== null && canManageLocalBackend}
            onOpenChange={(open) => {
              if (!open && !isUpdatingDesktopServerExposure)
                setPendingDesktopServerExposureMode(null);
            }}
          >
            <AlertDialogPopup>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {pendingDesktopServerExposureMode === "network-accessible"
                    ? "启用网络访问吗 ?"
                    : "禁用网络访问 ?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {pendingDesktopServerExposureMode === "network-accessible"
                    ? "让您的其他设备通过网络连接到T3 Code。 给它们访问的对等设备。T3 Code 将重新启动。"
                    : "局域网设备将断开连接。Tailscale HTTPS 等现有隧道仍可使用。T3 Code 将重启。"}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogClose
                  disabled={isUpdatingDesktopServerExposure}
                  render={<Button variant="outline" disabled={isUpdatingDesktopServerExposure} />}
                >
                  <span className="[text-box:trim-both_cap_alphabetic]">取消</span>
                </AlertDialogClose>
                <Button
                  variant="default"
                  onClick={handleConfirmDesktopServerExposureChange}
                  disabled={
                    !canManageLocalBackend ||
                    pendingDesktopServerExposureMode === null ||
                    isUpdatingDesktopServerExposure
                  }
                >
                  {isUpdatingDesktopServerExposure && <Spinner size="sm" />}
                  <span className="[text-box:trim-both_cap_alphabetic]">
                    {isUpdatingDesktopServerExposure
                      ? "重新启动中…"
                      : pendingDesktopServerExposureMode === "network-accessible"
                        ? "重新启动和启用"
                        : "重新启动和禁用"}
                  </span>
                </Button>
              </AlertDialogFooter>
            </AlertDialogPopup>
          </AlertDialog>
          <AlertDialog
            open={isWslConfirmDialogOpen && canManageLocalBackend}
            onOpenChange={(open) => {
              if (isUpdatingWslBackend) return;
              if (!open) setPendingWslChange(null);
            }}
          >
            <AlertDialogPopup>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {pendingWslChange?.kind === "disable"
                    ? pendingWslChange.wasWslOnly
                      ? "关上WSL再切换回Windows?"
                      : "禁用WSL 后端吗 ?"
                    : pendingWslChange?.kind === "distro"
                      ? "切换WSL distro?"
                      : pendingWslChange?.kind === "enable"
                        ? "启动WSL 后端"
                        : pendingWslChange?.nextValue
                          ? "只运行WSL 后端吗 ?"
                          : "再次启用Windows 后端吗 ?"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {pendingWslChange?.kind === "disable"
                    ? pendingWslChange.wasWslOnly
                      ? "T3 Code 将在Windows 后端重新启动。 会话和针对WSL 打开的项目在 distro 内部保持安全，并在您重新启用时再次可用。WSL。"
                      : "WSL 后端将停止。 打开的针对WSL 的会话和项目在 distro 内部保持安全，但不会在T3 Code 中出现，直到您重新启用WSL。"
                    : pendingWslChange?.kind === "distro"
                      ? "T3 Code 将在新 distro 上重新启动WSL 后端。 仍在当前 distro 上运行的会话将被中断。"
                      : pendingWslChange?.kind === "enable"
                        ? "运行WSL 后端与Windows 1 并列，或停止Windows 后端，只使用WSL ?您可以稍后从设置中更改。"
                        : pendingWslChange?.nextValue
                          ? "T3 Code 将重新启动并只启动WSL 后端。您的Windows 侧边项目将无法访问，直到您再次关闭此选项。"
                          : "T3 Code 将重新启动，并将Windows 后端与WSL 一同带回。"}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogClose
                  disabled={isUpdatingWslBackend}
                  render={<Button variant="outline" disabled={isUpdatingWslBackend} />}
                >
                  取消
                </AlertDialogClose>
                {pendingWslChange?.kind === "enable" ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => handleConfirmEnableWsl("wsl-only")}
                      disabled={isUpdatingWslBackend || !canManageLocalBackend}
                    >
                      {isUpdatingWslBackend ? (
                        <>
                          <Spinner size="sm" />
                          正在应用…
                        </>
                      ) : (
                        "只使用WSL label"
                      )}
                    </Button>
                    <Button
                      variant="default"
                      onClick={() => handleConfirmEnableWsl("both")}
                      disabled={isUpdatingWslBackend || !canManageLocalBackend}
                    >
                      {isUpdatingWslBackend ? (
                        <>
                          <Spinner size="sm" />
                          正在应用…
                        </>
                      ) : (
                        "运行两个后端"
                      )}
                    </Button>
                  </>
                ) : (
                  <Button
                    variant={
                      pendingWslChange?.kind === "disable" ||
                      (pendingWslChange?.kind === "wsl-only" && pendingWslChange.nextValue)
                        ? "destructive"
                        : "default"
                    }
                    onClick={handleConfirmWslChange}
                    disabled={isUpdatingWslBackend || !canManageLocalBackend}
                  >
                    {isUpdatingWslBackend ? (
                      <>
                        <Spinner size="sm" />
                        正在应用…
                      </>
                    ) : pendingWslChange?.kind === "disable" ? (
                      pendingWslChange.wasWslOnly ? (
                        "切换到Windows"
                      ) : (
                        "禁用WSL"
                      )
                    ) : pendingWslChange?.kind === "distro" ? (
                      "切换 Distro"
                    ) : pendingWslChange?.nextValue ? (
                      "重新启动和启用"
                    ) : (
                      "重新启动和禁用"
                    )}
                  </Button>
                )}
              </AlertDialogFooter>
            </AlertDialogPopup>
          </AlertDialog>
          <AlertDialog
            open={disableTailscaleServeDialogOpen && canManageLocalBackend}
            onOpenChange={(open) => {
              if (isUpdatingTailscaleServe) return;
              setDisableTailscaleServeDialogOpen(open);
            }}
          >
            <AlertDialogPopup>
              <AlertDialogHeader>
                <AlertDialogTitle>要关闭 Tailscale HTTPS 吗？</AlertDialogTitle>
                <AlertDialogDescription>
                  T3 Code 将重新启动本地后端，不包含Tailscale Service。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogClose
                  disabled={isUpdatingTailscaleServe}
                  render={<Button variant="outline" disabled={isUpdatingTailscaleServe} />}
                >
                  取消
                </AlertDialogClose>
                <Button
                  variant="destructive"
                  onClick={() => void handleConfirmTailscaleServeDisable()}
                  disabled={isUpdatingTailscaleServe || !canManageLocalBackend}
                >
                  {isUpdatingTailscaleServe ? (
                    <>
                      <Spinner size="sm" />
                      重新启动中…
                    </>
                  ) : (
                    "重新启动和禁用"
                  )}
                </Button>
              </AlertDialogFooter>
            </AlertDialogPopup>
          </AlertDialog>
          <Dialog
            open={pendingTailscaleServeEndpoint !== null}
            onOpenChange={(open) => {
              if (isUpdatingTailscaleServe) return;
              if (!open) setPendingTailscaleServeEndpoint(null);
            }}
          >
            <DialogPopup className="max-w-md">
              <DialogHeader>
                <DialogTitle>要设置 Tailscale HTTPS 吗？</DialogTitle>
                <DialogDescription>
                  T3 Code 将重启本地后端，并通过 Tailscale Serve 将 HTTPS 请求转发到此后端。
                </DialogDescription>
              </DialogHeader>
              <DialogPanel>
                <label className="block">
                  <span className="text-sm font-medium text-foreground">HTTPS 端口</span>
                  <Input
                    className="mt-2"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={65_535}
                    step={1}
                    value={tailscaleServePortInput}
                    onChange={(event) => setTailscaleServePortInput(event.target.value)}
                    disabled={isUpdatingTailscaleServe}
                  />
                </label>
                {!isTailscaleServePortValid ? (
                  <p className="mt-2 text-xs text-destructive">输入1至65535的端口。</p>
                ) : null}
                <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
                  <p className="text-xs font-medium text-muted-foreground">HTTPS 结束点</p>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <p className="mt-1 truncate text-sm text-foreground">
                          {pendingTailscaleServeBaseUrl ?? "等待 MagicDNS 结束点"}
                        </p>
                      }
                    />
                    {pendingTailscaleServeBaseUrl ? (
                      <TooltipPopup side="top">{pendingTailscaleServeBaseUrl}</TooltipPopup>
                    ) : null}
                  </Tooltip>
                </div>
              </DialogPanel>
              <DialogFooter>
                <DialogClose
                  disabled={isUpdatingTailscaleServe}
                  render={<Button variant="outline" disabled={isUpdatingTailscaleServe} />}
                >
                  取消
                </DialogClose>
                <Button
                  onClick={() => void handleConfirmTailscaleServeSetup()}
                  disabled={isUpdatingTailscaleServe || !isTailscaleServePortValid}
                >
                  {isUpdatingTailscaleServe ? (
                    <>
                      <Spinner size="sm" />
                      重新启动中…
                    </>
                  ) : (
                    "启用"
                  )}
                </Button>
              </DialogFooter>
            </DialogPopup>
          </Dialog>
        </>
      ) : (
        <SettingsSection {...searchableSetting("connections-environment")}>
          <SettingsRow title="未选择环境" description="连接一个环境以查看其设置和访问。" />
        </SettingsSection>
      )}
    </>
  );

  if (showsAccess) return <SettingsPageContainer>{primarySettings}</SettingsPageContainer>;

  return (
    <SettingsPageContainer>
      {desktopBridge ? (
        <SettingsSection id="this-app" title="这个应用">
          <LocalEnvironmentSetting />
        </SettingsSection>
      ) : null}
      <SettingsSection
        {...searchableSetting("remote-environments")}
        title="环境"
        headerAction={
          <div className="flex items-center gap-1">
            {savedServerUpdateTargets.length > 0 ? (
              <ServerUpdatesAction targets={savedServerUpdateTargets} variant="ghost-muted" />
            ) : null}
            <AddEnvironmentDialog
              open={addBackendDialogOpen}
              routeTarget={routeTarget}
              error={savedBackendError}
              savedEnvironments={savedEnvironments}
              onOpenChange={handleAddBackendDialogOpenChange}
              onErrorChange={setSavedBackendError}
            />
          </div>
        }
      >
        {listedEnvironments.map((environment) => (
          <SavedBackendListRow
            key={environment.environmentId}
            environment={environment}
            removingEnvironmentId={removingSavedEnvironmentId}
            onSetEnabled={handleSetSavedBackendEnabled}
            onRemove={handleRemoveSavedBackend}
            onAddRoute={(target) => {
              setRouteTarget(target);
              setSavedBackendError(null);
              setAddBackendDialogOpen(true);
            }}
          />
        ))}
        {listedEnvironments.length === 0 ? <EmptyRemoteEnvironments /> : null}
      </SettingsSection>
      {peerLinkHosts.map((environment, index) => (
        <LinkedEnvironmentsSettings
          key={environment.environmentId}
          environmentId={environment.environmentId}
          environmentLabel={peerLinkHosts.length > 1 ? environment.label : null}
          isSearchTarget={index === 0}
        />
      ))}
      <LoadBalancingSettings environments={loadBalancingEnvironments} />
      <PullRequestRoutingSettings environments={loadBalancingEnvironments} />
    </SettingsPageContainer>
  );
}
