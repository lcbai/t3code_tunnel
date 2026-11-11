import { useAtomSet, useAtomValue } from "@effect/atom-react";
import type { ToolCallVisibility } from "@t3tools/contracts/settings";
import { AsyncResult } from "effect/reactivity";
import { View } from "react-native";

import { AppText as Text } from "../../../../components/ui/AppText";
import { ListChoiceRow } from "../../../../components/ui/ListChoiceRow";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../../../state/preferences";
import { SettingsSection } from "../../components/SettingsSection";

const TOOL_CALL_VISIBILITY_OPTIONS: ReadonlyArray<{
  readonly value: ToolCallVisibility;
  readonly label: string;
}> = [
  { value: "showAll", label: "全部显示" },
  { value: "hideSuccessful", label: "隐藏已成功项" },
  { value: "hideAll", label: "全部隐藏" },
  { value: "zen", label: "专注模式" },
];

export function ToolCallsAppearanceSection() {
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const preferences = useAtomValue(mobilePreferencesAtom);
  const selected = AsyncResult.isSuccess(preferences)
    ? (preferences.value.toolCallVisibility ?? "showAll")
    : null;

  return (
    <View className="gap-3">
      <SettingsSection title="在会话中显示工具调用">
        {TOOL_CALL_VISIBILITY_OPTIONS.map((option, index) => (
          <ListChoiceRow
            key={option.value}
            label={option.label}
            selected={selected === option.value}
            separated={index > 0}
            disabled={selected === null}
            onPress={() => savePreferences({ toolCallVisibility: option.value })}
          />
        ))}
      </SettingsSection>
      <Text className="px-2 text-sm text-foreground-muted">
        隐藏智能体执行的命令、编辑和搜索。「隐藏已成功项」会保留失败的操作，「专注模式」仅显示最终答复。审批、问题和错误始终显示。
      </Text>
    </View>
  );
}
