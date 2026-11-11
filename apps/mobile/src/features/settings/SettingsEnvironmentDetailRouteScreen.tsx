import * as Dialog from "../../components/ui/Dialog";
import { useAtom, useAtomValue } from "@effect/atom-react";
import { useNavigation, type StaticScreenProps } from "@react-navigation/native";
import {
  AuthProvidersManageScope,
  AuthOrchestrationReadScope,
  managedUpdatesDenial,
  type EnvironmentId,
  type ServerProvider,
} from "@t3tools/contracts";
import { settlePromise, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { sessionPermissionsUnavailableMessage } from "@t3tools/shared/authScopeOptions";
import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import { AsyncResult } from "effect/reactivity";
import { useRef, useState } from "react";
import { Linking, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/ui/AppText";
import { ProviderIcon } from "../../components/ProviderIcon";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { appAtomRegistry } from "../../state/atom-registry";
import { environmentPresentations } from "../../state/presentation";
import { serverEnvironment } from "../../state/server";
import { environmentSession, useEnvironmentScope, readEnvironmentScope } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import { useRemoteConnections } from "../../state/use-remote-environment-registry";
import { ConnectionEnvironmentRow } from "../connection/ConnectionEnvironmentRow";
import { EnvironmentRoutesSection } from "./EnvironmentRoutesSection";
import { OutdatedServerUpdateSection } from "./OutdatedServerUpdateSection";
import { ListActionRow as SettingsActionRow } from "../../components/ui/ListActionRow";
import { SettingsScreen } from "./components/SettingsScreen";
import { SettingsSection } from "./components/SettingsSection";
import {
  canMaintainEnvironment,
  canUpdateEnvironmentProvider,
  supportsEnvironmentUpdate,
} from "./environment-maintenance";
import { environmentReleaseCheckAtom, releaseCheckValue } from "./environmentUpdateCheck";

export function SettingsEnvironmentDetailRouteScreen({
  route,
}: StaticScreenProps<{
  readonly environmentId: EnvironmentId;
}>) {
  return (
    <EnvironmentDetail
      key={route.params.environmentId}
      environmentId={route.params.environmentId}
    />
  );
}

function EnvironmentDetail({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const connections = useRemoteConnections();
  const environment = connections.connectedEnvironments.find(
    (entry) => entry.environmentId === environmentId,
  );
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const session = useAtomValue(environmentSession.sessionStateValueAtom(environmentId));
  const sessionResult = useAtomValue(environmentSession.sessionStateAtom(environmentId));
  const updateState = useAtomValue(serverEnvironment.updateStateAtom(environmentId));
  const outdated =
    useAtomValue(environmentPresentations.presentationAtom(environmentId))?.entry
      .serverUpdateRequired === true;
  const updateServer = useAtomCommand(serverEnvironment.updateServer);
  const updateProvider = useAtomCommand(serverEnvironment.updateProvider);
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders);
  const [connectionExpanded, setConnectionExpanded] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [releaseCheck, checkRelease] = useAtom(environmentReleaseCheckAtom(environmentId), {
    mode: "promiseExit",
  });
  const release = releaseCheckValue(releaseCheck);

  const connected = environment?.isEnabled === true && environment.connectionState === "connected";
  const allowed =
    !AsyncResult.isFailure(sessionResult) && canMaintainEnvironment(session, connected);
  const running = updateState.status === "running";
  const providerBusy =
    config?.providers.some(
      (provider) =>
        provider.updateState?.status === "running" || provider.updateState?.status === "queued",
    ) ?? false;
  const canManageProviders = useEnvironmentScope(environmentId, AuthProvidersManageScope);
  const canRead = useEnvironmentScope(environmentId, AuthOrchestrationReadScope);
  const busy = !connected || pending !== null || running || providerBusy;
  const disabled = !allowed || busy;
  const version = config?.environment.serverVersion;
  const checkedRelease = release?.fromVersion === version ? release : null;
  const capabilities = config?.environment.capabilities;
  const managedPolicy = config?.managedPolicy;
  const supportUrl = managedPolicy?.supportUrl;
  // The server refuses checks and installs; say so instead of offering them.
  const updatesDenial = managedUpdatesDenial(managedPolicy);

  async function run(label: string, action: () => Promise<void>) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(label);
    setError(null);
    setNotice(null);
    const result = await settlePromise(action);
    pendingRef.current = false;
    setPending(null);
    if (AsyncResult.isFailure(result)) {
      const cause = squashAtomCommandFailure(result);
      setError(
        cause instanceof Error ? cause.message : "The action could not be completed. Try again.",
      );
    }
  }

  function requestServerUpdate() {
    const targetVersion = checkedRelease?.targetVersion;
    if (disabled || !targetVersion || !capabilities || !supportsEnvironmentUpdate(capabilities))
      return;
    Dialog.alert(
      `更新 ${environment?.environmentLabel ?? "environment"}?`,
      `Install T3 Code ${targetVersion}. ${capabilities.serverSelfUpdate === "desktop-managed" ? "The desktop app will close and relaunch." : "The server will restart and reconnect."} Running threads may be interrupted.`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "更新",
          onPress: () =>
            void run("server", async () => {
              if (
                AsyncResult.isFailure(
                  appAtomRegistry.get(environmentSession.sessionStateAtom(environmentId)),
                ) ||
                !canMaintainEnvironment(
                  appAtomRegistry.get(environmentSession.sessionStateValueAtom(environmentId)),
                  connected,
                )
              )
                return;
              const result = await updateServer({
                environmentId,
                input: { targetVersion },
              });
              if (AsyncResult.isFailure(result)) throw squashAtomCommandFailure(result);
              setNotice(`Updated to ${result.value.targetVersion}.`);
            }),
        },
      ],
    );
  }

  function requestProviderUpdate(provider: ServerProvider) {
    if (
      busy ||
      !readEnvironmentScope(environmentId, AuthProvidersManageScope) ||
      !canUpdateEnvironmentProvider(provider)
    )
      return;
    void run(provider.instanceId, async () => {
      const result = await updateProvider({
        environmentId,
        input: {
          provider: provider.driver,
          instanceId: provider.instanceId,
        },
      });
      if (AsyncResult.isFailure(result)) throw squashAtomCommandFailure(result);
    });
  }

  return (
    <SettingsScreen title={environment?.environmentLabel ?? "环境"}>
      <ScreenScrollView
        contentInsetAdjustmentBehavior="automatic"
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        {!environment ? (
          <Text className="text-base text-foreground-muted">此环境已从当前设备移除。</Text>
        ) : (
          <>
            <SettingsSection title="连接">
              <ConnectionEnvironmentRow
                environment={environment}
                expanded={connectionExpanded}
                onToggle={() => setConnectionExpanded((value) => !value)}
                onReconnect={connections.onReconnectEnvironment}
                onRemove={connections.onRemoveEnvironmentPress}
                onSetEnabled={connections.onSetEnvironmentEnabled}
                onUpdate={connections.onUpdateEnvironment}
              />
            </SettingsSection>
            <EnvironmentRoutesSection
              environmentId={environmentId}
              connected={connected}
              onAddRoute={() =>
                navigation.navigate("SettingsEnvironmentNew", { routeFor: environmentId })
              }
            />
            {outdated ? (
              <OutdatedServerUpdateSection
                environmentId={environmentId}
                label={environment.environmentLabel}
              />
            ) : !connected ? (
              <Text className="px-2 text-sm text-foreground-muted">连接此环境后即可管理。</Text>
            ) : !allowed ? (
              <Text className="px-2 text-sm text-foreground-muted">
                {AsyncResult.isFailure(sessionResult) || session === null || !session.authenticated
                  ? sessionPermissionsUnavailableMessage({
                      connected,
                      failed: AsyncResult.isFailure(sessionResult),
                      rejected:
                        !AsyncResult.isFailure(sessionResult) && session?.authenticated === false,
                    })
                  : "此连接无权管理该环境。"}
              </Text>
            ) : null}
            {error ? (
              <Text selectable className="px-2 text-sm text-danger-foreground">
                {error}
              </Text>
            ) : null}
            {notice ? <Text className="px-2 text-sm text-foreground-muted">{notice}</Text> : null}
            {config && !outdated ? (
              <>
                <SettingsSection title="T3 Code">
                  <View className="gap-1 p-4">
                    <Text className="text-base text-foreground">版本 {version}</Text>
                    {managedPolicy ? (
                      <Text className="text-sm text-foreground-muted">
                        管理方 {managedPolicy.organization}
                      </Text>
                    ) : null}
                    {updatesDenial ? (
                      <Text className="text-sm text-foreground-muted">{updatesDenial}</Text>
                    ) : null}
                    {running ? (
                      <Text className="text-sm text-foreground-muted">
                        {updateState.stage === "resuming" ? "正在重启并重新连接…" : "正在下载更新…"}
                      </Text>
                    ) : updateState.status === "failed" ? (
                      <Text selectable className="text-sm text-danger-foreground">
                        {updateState.message}
                      </Text>
                    ) : null}
                    {checkedRelease && !updatesDenial ? (
                      <Text className="text-sm text-foreground-muted">
                        {checkedRelease.targetVersion
                          ? `版本 ${checkedRelease.targetVersion} 可用。`
                          : "当前已是最新版本。"}
                      </Text>
                    ) : null}
                    {checkedRelease?.targetVersion &&
                    !updatesDenial &&
                    !supportsEnvironmentUpdate(config.environment.capabilities) ? (
                      <Text className="text-sm text-foreground-muted">
                        {capabilities?.serverSelfUpdate === "desktop-managed"
                          ? "请更新该设备上的桌面应用。"
                          : "请更新并重启该设备上的 T3 Code。"}
                      </Text>
                    ) : null}
                  </View>
                  {supportUrl ? (
                    <SettingsActionRow
                      icon="questionmark.bubble"
                      label={`获取帮助：${managedPolicy.organization}`}
                      onPress={() => void Linking.openURL(supportUrl).catch(() => undefined)}
                    />
                  ) : null}
                  {updatesDenial ? null : (
                    <SettingsActionRow
                      icon="arrow.clockwise"
                      label="检查更新"
                      disabled={disabled}
                      loading={pending === "check"}
                      onPress={() => {
                        if (disabled) return;
                        const fromVersion = config.environment.serverVersion;
                        void run("check", async () => {
                          const exit = await checkRelease(async () => fromVersion);
                          // `run` owns the error message, so a failed lookup rethrows to it.
                          if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
                        });
                      }}
                    />
                  )}
                  {checkedRelease?.targetVersion &&
                  !updatesDenial &&
                  supportsEnvironmentUpdate(config.environment.capabilities) ? (
                    <SettingsActionRow
                      icon="arrow.up.circle"
                      label={`更新到 ${checkedRelease.targetVersion}`}
                      disabled={disabled}
                      loading={pending === "server" || running}
                      onPress={requestServerUpdate}
                    />
                  ) : null}
                </SettingsSection>
                <SettingsSection title="提供方">
                  <SettingsActionRow
                    icon="arrow.clockwise"
                    label="刷新提供方"
                    disabled={busy || !canRead}
                    loading={pending === "refresh"}
                    onPress={() => {
                      if (busy || !canRead) return;
                      void run("refresh", async () => {
                        if (!readEnvironmentScope(environmentId, AuthOrchestrationReadScope))
                          return;
                        const result = await refreshProviders({
                          environmentId,
                          input: { reloadSecrets: true },
                        });
                        if (AsyncResult.isFailure(result)) throw squashAtomCommandFailure(result);
                        setNotice("Provider status refreshed.");
                      });
                    }}
                  />
                  {config.providers
                    .filter((provider) => provider.enabled)
                    .map((provider) => (
                      <View key={provider.instanceId}>
                        <View className="gap-1 p-4">
                          <View className="flex-row items-center gap-2">
                            <ProviderIcon
                              provider={provider.driver}
                              iconUrl={provider.iconUrl}
                              size={18}
                            />
                            <Text className="min-w-0 flex-1 text-base font-t3-medium text-foreground">
                              {provider.displayName ?? provider.driver}
                            </Text>
                          </View>
                          <Text className="text-sm text-foreground-muted">
                            {provider.installed ? (provider.version ?? "版本未知") : "未安装"}
                            {provider.versionAdvisory?.latestVersion
                              ? ` · 最新版本 ${provider.versionAdvisory.latestVersion}`
                              : ""}
                          </Text>
                          {provider.updateState && provider.updateState.status !== "idle" ? (
                            <Text
                              selectable
                              className={
                                provider.updateState.status === "failed"
                                  ? "text-sm text-danger-foreground"
                                  : "text-sm text-foreground-muted"
                              }
                            >
                              {provider.updateState.message ??
                                `更新 ${provider.updateState.status}`}
                            </Text>
                          ) : null}
                          {provider.compatibilityAdvisory?.message ? (
                            <Text selectable className="text-sm text-foreground-muted">
                              {provider.compatibilityAdvisory.message}
                            </Text>
                          ) : null}
                          {provider.unavailableReason || provider.message ? (
                            <Text selectable className="text-sm text-foreground-muted">
                              {provider.unavailableReason ?? provider.message}
                            </Text>
                          ) : null}
                          {provider.versionAdvisory?.status === "behind_latest" &&
                          !provider.versionAdvisory.canUpdate ? (
                            <Text className="text-sm text-foreground-muted">
                              请在此环境所在的设备上更新该提供方。
                            </Text>
                          ) : null}
                        </View>
                        {canUpdateEnvironmentProvider(provider) ? (
                          <SettingsActionRow
                            icon="arrow.up.circle"
                            label={`更新 ${provider.displayName ?? provider.driver}`}
                            disabled={busy || !canManageProviders}
                            loading={pending === provider.instanceId}
                            onPress={() => requestProviderUpdate(provider)}
                          />
                        ) : null}
                      </View>
                    ))}
                </SettingsSection>
              </>
            ) : null}
          </>
        )}
      </ScreenScrollView>
    </SettingsScreen>
  );
}
