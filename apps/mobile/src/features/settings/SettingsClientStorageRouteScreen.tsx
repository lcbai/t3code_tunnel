import * as Dialog from "../../components/ui/Dialog";
import { AppActivityIndicator } from "../../components/ui/AppActivityIndicator";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { type EnvironmentMachineKind, resolveEnvironmentMachineKind } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { useMemo } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";
import { ENVIRONMENT_MACHINE_SYMBOLS } from "../../components/EnvironmentMachineSymbol";
import {
  clearClientCacheAtom,
  clientCacheSummaryAtom,
  type EnvironmentClientCacheSummary,
} from "../../state/client-cache-state";
import { useServerConfigs } from "../../state/entities";
import { useSavedRemoteConnections } from "../../state/use-remote-environment-registry";
import { ListActionRow as SettingsActionRow } from "../../components/ui/ListActionRow";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsScreen } from "./components/SettingsScreen";
import { formatBytes } from "../../lib/formatBytes";

export function SettingsClientStorageRouteScreen() {
  const insets = useSafeAreaInsets();
  const summaryResult = useAtomValue(clientCacheSummaryAtom);
  const clearResult = useAtomValue(clearClientCacheAtom);
  const clearCache = useAtomSet(clearClientCacheAtom);
  const { savedConnectionsById } = useSavedRemoteConnections();
  const serverConfigs = useServerConfigs();
  const isClearing = clearResult.waiting;
  const summary = AsyncResult.isSuccess(summaryResult) ? summaryResult.value : null;
  const environmentSummaries = useMemo(
    () =>
      [...(summary?.environments ?? [])].sort((left, right) => {
        const leftLabel = savedConnectionsById[left.environmentId]?.environmentLabel ?? "";
        const rightLabel = savedConnectionsById[right.environmentId]?.environmentLabel ?? "";
        return leftLabel.localeCompare(rightLabel);
      }),
    [savedConnectionsById, summary?.environments],
  );

  const confirmClearEnvironment = (environment: EnvironmentClientCacheSummary) => {
    const label =
      savedConnectionsById[environment.environmentId]?.environmentLabel ??
      environment.environmentId;
    Dialog.confirm({
      title: `清除缓存：${label}?`,
      message: "这会移除此环境的离线会话、服务器元数据和分支缓存，保留已保存的连接和凭据。",
      confirmText: "清除缓存",
      destructive: true,
      onConfirm: () =>
        clearCache({ type: "environment", environmentId: environment.environmentId }),
    });
  };

  const confirmClearAll = () => {
    Dialog.confirm({
      title: "清除所有客户端缓存？",
      message: "这会移除所有环境的离线数据，保留连接、凭据和应用偏好。",
      confirmText: "清除所有缓存",
      destructive: true,
      onConfirm: () => clearCache({ type: "all" }),
    });
  };

  return (
    <SettingsScreen title="客户端存储">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentInset={{ bottom: Math.max(insets.bottom, 18) }}
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-4 pb-[18px]"
      >
        <SettingsSection title="环境缓存">
          {AsyncResult.isFailure(summaryResult) ? (
            <View className="items-center gap-2 px-6 py-8">
              <SymbolView
                name="exclamationmark.triangle"
                size={28}
                tintColorClassName="accent-danger-foreground"
                type="monochrome"
                weight="regular"
              />
              <Text className="text-center text-base text-foreground">存储不可用</Text>
              <Text className="text-center text-sm text-foreground-muted">请重启应用后重试。</Text>
            </View>
          ) : !summary ? (
            <View className="items-center gap-3 px-6 py-8">
              <AppActivityIndicator />
              <Text className="text-center text-sm text-foreground-muted">正在检查缓存数据…</Text>
            </View>
          ) : environmentSummaries.length > 0 ? (
            environmentSummaries.map((environment, index) => (
              <CacheEnvironmentRow
                key={environment.environmentId}
                environment={environment}
                environmentLabel={
                  savedConnectionsById[environment.environmentId]?.environmentLabel ??
                  environment.environmentId
                }
                machine={resolveEnvironmentMachineKind(
                  serverConfigs.get(environment.environmentId) ?? null,
                )}
                disabled={isClearing}
                first={index === 0}
                onClear={() => confirmClearEnvironment(environment)}
              />
            ))
          ) : (
            <View className="items-center gap-2 px-6 py-8">
              <SymbolView
                name="checkmark.circle"
                size={28}
                tintColorClassName="accent-icon"
                type="monochrome"
                weight="regular"
              />
              <Text className="text-center text-base text-foreground">没有缓存数据</Text>
              <Text className="text-center text-sm text-foreground-muted">
                使用环境后，离线缓存记录将显示在这里。
              </Text>
            </View>
          )}
        </SettingsSection>

        <View className="gap-3">
          <SettingsSection title="操作">
            <SettingsActionRow
              icon="trash"
              label={summary ? `清除 ${formatBytes(summary.payloadBytes)}` : "清除缓存"}
              tone="danger"
              disabled={isClearing || !summary || summary.recordCount === 0}
              loading={isClearing}
              onPress={confirmClearAll}
            />
          </SettingsSection>
          <Text className="px-2 text-sm leading-normal text-foreground-muted">
            清除缓存会保留环境连接、凭据和外观设置。
          </Text>
          {AsyncResult.isFailure(summaryResult) || AsyncResult.isFailure(clearResult) ? (
            <Text selectable className="px-2 text-sm text-danger-foreground">
              客户端存储暂时不可用。请重启应用后重试。
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </SettingsScreen>
  );
}

function CacheEnvironmentRow(props: {
  readonly environment: EnvironmentClientCacheSummary;
  readonly environmentLabel: string;
  readonly machine: EnvironmentMachineKind;
  readonly disabled: boolean;
  readonly first: boolean;
  readonly onClear: () => void;
}) {
  return (
    <View className={props.first ? undefined : "border-t border-border"}>
      <SettingsActionRow
        icon={ENVIRONMENT_MACHINE_SYMBOLS[props.machine]}
        label={props.environmentLabel}
        description={`清除 ${formatBytes(props.environment.payloadBytes)} / cached data`}
        tone="danger"
        disabled={props.disabled}
        onPress={props.onClear}
      />
    </View>
  );
}
