import { View } from "react-native";

import { ListChoiceRow as SettingsChoiceRow } from "../../../../components/ui/ListChoiceRow";
import { SettingsSection } from "../../components/SettingsSection";
import { useAppearancePreferences } from "../AppearancePreferencesProvider";

export function AndroidNavigationAppearanceSection() {
  const { isReady, androidNavigationStyle, setAndroidNavigationStyle } = useAppearancePreferences();
  return (
    <SettingsSection title="导航">
      <View accessibilityRole="radiogroup">
        <SettingsChoiceRow
          label="One UI"
          description="悬浮导航栏，带独立的新建会话按钮。"
          disabled={!isReady}
          selected={androidNavigationStyle === "one-ui"}
          onPress={() => setAndroidNavigationStyle("one-ui")}
        />
        <SettingsChoiceRow
          label="材质"
          description="标准 Android 导航栏和侧边导航。"
          disabled={!isReady}
          selected={androidNavigationStyle === "material"}
          onPress={() => setAndroidNavigationStyle("material")}
          separated
        />
      </View>
    </SettingsSection>
  );
}
