import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import type { SidebarProjectGroupingMode } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SettingsScreen } from "./components/SettingsScreen";
import {
  mobileProjectGroupingModePatch,
  resolveMobileProjectGroupingSettings,
} from "../../state/project-grouping";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { ListChoiceRow as SettingsChoiceRow } from "../../components/ui/ListChoiceRow";
import { SettingsSection } from "./components/SettingsSection";
import { NewThreadSettingsSection, WorkingSectionSettings } from "./ThreadSettingsSections";

const GROUPING_OPTIONS: ReadonlyArray<{
  readonly mode: SidebarProjectGroupingMode;
  readonly label: string;
  readonly description: string;
}> = [
  {
    mode: "repository",
    label: "按仓库分组",
    description: "匹配的仓库会合并显示为一个项目。",
  },
  {
    mode: "repository_path",
    label: "按仓库路径分组",
    description: "在单体仓库中分别显示不同路径。",
  },
  {
    mode: "separate",
    label: "保持独立",
    description: "将每个工作区显示为独立的项目。",
  },
];

export function SettingsProjectGroupingRouteScreen() {
  const insets = useSafeAreaInsets();
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferencesReady = AsyncResult.isSuccess(preferencesResult) && !preferencesResult.waiting;
  const selectedMode = AsyncResult.isSuccess(preferencesResult)
    ? resolveMobileProjectGroupingSettings(preferencesResult.value).sidebarProjectGroupingMode
    : null;

  return (
    <SettingsScreen title="通用">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-3 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <SettingsSection title="项目分组">
          {GROUPING_OPTIONS.map((option, index) => (
            <SettingsChoiceRow
              key={option.mode}
              label={option.label}
              description={option.description}
              selected={selectedMode === option.mode}
              separated={index > 0}
              disabled={!preferencesReady}
              onPress={() => savePreferences(mobileProjectGroupingModePatch(option.mode))}
            />
          ))}
        </SettingsSection>
        <WorkingSectionSettings />
        <NewThreadSettingsSection />
      </ScrollView>
    </SettingsScreen>
  );
}
