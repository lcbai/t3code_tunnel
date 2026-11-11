import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/ui/AppText";
import { DEFAULT_FOLLOW_UP_BEHAVIOR, type FollowUpBehavior } from "../../lib/followUpBehavior";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { ListChoiceRow as SettingsChoiceRow } from "../../components/ui/ListChoiceRow";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsScreen } from "./components/SettingsScreen";

const FOLLOW_UP_OPTIONS: ReadonlyArray<{
  readonly behavior: FollowUpBehavior;
  readonly label: string;
  readonly description: string;
}> = [
  {
    behavior: "queue",
    label: "队列",
    description: "消息会加入队列，等当前轮次结束后执行。",
  },
  {
    behavior: "steer",
    label: "引导",
    description: "立即向智能体发送此消息，调整它当前的工作。",
  },
];

export function SettingsFollowUpRouteScreen() {
  const insets = useSafeAreaInsets();
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferencesReady = AsyncResult.isSuccess(preferencesResult) && !preferencesResult.waiting;
  const selectedBehavior = AsyncResult.isSuccess(preferencesResult)
    ? (preferencesResult.value.followUpBehavior ?? DEFAULT_FOLLOW_UP_BEHAVIOR)
    : null;

  const content = (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      className="flex-1"
      contentContainerClassName="gap-3 px-5 pt-4"
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
    >
      <SettingsSection title="智能体运行期间">
        {FOLLOW_UP_OPTIONS.map((option, index) => (
          <SettingsChoiceRow
            key={option.behavior}
            label={option.label}
            description={option.description}
            selected={selectedBehavior === option.behavior}
            separated={index > 0}
            disabled={!preferencesReady}
            onPress={() => savePreferences({ followUpBehavior: option.behavior })}
          />
        ))}
      </SettingsSection>
      <Text className="px-2 text-sm text-foreground-muted">
        长按发送按钮可为当前消息使用另一选项。使用实体键盘时，按住{" "}
        {Platform.OS === "android" ? "Ctrl" : "⌘"} 发送。
      </Text>
    </ScrollView>
  );

  return <SettingsScreen title="会话">{content}</SettingsScreen>;
}
