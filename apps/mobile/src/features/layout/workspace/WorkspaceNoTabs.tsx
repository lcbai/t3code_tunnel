import { useNavigation } from "@react-navigation/native";
import { View } from "react-native";
import { EmptyState } from "../../../components/ui/EmptyState";
import { openSettings } from "../../settings/settings-navigation";

export function WorkspaceNoTabs() {
  const navigation = useNavigation();
  return (
    <View className="flex-1 items-center justify-center bg-screen">
      <EmptyState
        title="所有分区均已隐藏"
        detail="显示某个分区可将其添加回导航栏。"
        actionLabel="Edit navigation tabs"
        variant="plain"
        onAction={() => openSettings(navigation, "SettingsNavigation")}
      />
    </View>
  );
}
