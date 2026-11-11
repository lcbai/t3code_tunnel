import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useAdaptiveWorkspaceLayout } from "../layout/adaptive-workspace-context";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  moveNavigationTab,
  navigationCustomizationAvailable,
  toggleNavigationTabVisibility,
} from "../layout/workspace/navigation-tab-order";
import { AppText as Text } from "../../components/ui/AppText";
import { IconButton } from "../../components/ui/IconButton";
import { Button } from "../../components/ui/Button";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { SymbolView } from "../../components/ui/AppSymbol";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import {
  NAVIGATION_TAB_ICONS,
  WORKSPACE_TAB_LABELS,
  useNavigationTabOrder,
  useHiddenNavigationTabs,
  useEnabledNavigationTabs,
} from "../layout/workspace/navigation-tabs";
import { SettingsScreen } from "./components/SettingsScreen";
import { SettingsSection } from "./components/SettingsSection";
import { resolveWorkspaceTabOrder } from "../layout/workspace/workspace-tabs-state";

export function SettingsNavigationRouteScreen() {
  const insets = useSafeAreaInsets();
  const order = useNavigationTabOrder();
  const { layout } = useAdaptiveWorkspaceLayout();
  const capacity = Platform.OS === "android" && layout.usesSplitView ? 5 : 4;
  const hidden = useHiddenNavigationTabs();
  const enabled = useEnabledNavigationTabs();
  const preferences = useAtomValue(mobilePreferencesAtom);
  const customizable = navigationCustomizationAvailable();
  const ready = customizable && AsyncResult.isSuccess(preferences) && !preferences.waiting;
  const save = useAtomSet(updateMobilePreferencesAtom);
  return (
    <SettingsScreen title="导航标签页">
      <ScreenScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-4 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        <Text className="px-2 text-sm text-foreground-muted">
          {customizable
            ? "手机显示前四个启用的分区，Android 平板的导航栏显示所有启用的分区。其余分区显示在「设置」顶部。隐藏的分区仅在这里显示。「设置」始终排在最后。此设置保存在当前设备。"
            : "拥有六个分区（包括「设置」）时，可以自定义标签页。"}
        </Text>
        <SettingsSection title="标签页顺序">
          {order.map((tab, index) => (
            <View key={tab} className="flex-row items-center gap-3 px-4 py-3">
              <SymbolView
                name={NAVIGATION_TAB_ICONS[tab]}
                size={22}
                tintColorClassName="accent-icon"
              />
              <View className="flex-1">
                <Text>{WORKSPACE_TAB_LABELS[tab]}</Text>
                <Text className="text-xs text-foreground-muted">
                  {hidden.includes(tab)
                    ? "已隐藏"
                    : enabled.indexOf(tab) < capacity
                      ? `标签页 ${enabled.indexOf(tab) + 1}`
                      : "在设置中"}
                </Text>
              </View>
              <IconButton
                icon={hidden.includes(tab) ? "eye.slash" : "eye"}
                accessibilityLabel={`${hidden.includes(tab) ? "Show" : "Hide"} ${WORKSPACE_TAB_LABELS[tab]}`}
                disabled={!ready}
                onPress={() =>
                  save({
                    transform: (current) => ({
                      hiddenNavigationTabs: toggleNavigationTabVisibility(
                        current.hiddenNavigationTabs,
                        tab,
                      ),
                    }),
                  })
                }
              />
              <IconButton
                icon="arrow.up"
                accessibilityLabel={`移动 ${WORKSPACE_TAB_LABELS[tab]} up`}
                disabled={!ready || index === 0}
                onPress={() =>
                  save({
                    transform: (current) => ({
                      navigationTabOrder: moveNavigationTab(
                        resolveWorkspaceTabOrder(current.navigationTabOrder),
                        tab,
                        index - 1,
                      ),
                    }),
                  })
                }
              />
              <IconButton
                icon="arrow.down"
                accessibilityLabel={`移动 ${WORKSPACE_TAB_LABELS[tab]} down`}
                disabled={!ready || index === order.length - 1}
                onPress={() =>
                  save({
                    transform: (current) => ({
                      navigationTabOrder: moveNavigationTab(
                        resolveWorkspaceTabOrder(current.navigationTabOrder),
                        tab,
                        index + 1,
                      ),
                    }),
                  })
                }
              />
            </View>
          ))}
        </SettingsSection>
        <Button
          label="重置标签页"
          tone="text"
          disabled={!ready}
          onPress={() => save({ navigationTabOrder: [], hiddenNavigationTabs: [] })}
        />
      </ScreenScrollView>
    </SettingsScreen>
  );
}
