import * as Dialog from "../../components/ui/Dialog";
import type { ServerProvider } from "@t3tools/contracts";
import { CHATGPT_USAGE_URL, usesChatGptSharing } from "@t3tools/shared/usageLimits";
import { Linking, Pressable, View } from "react-native";
import { AppText as Text } from "../../components/ui/AppText";
import { ProviderIcon } from "../../components/ProviderIcon";

export function ChatGptSharingStatus({ provider }: { provider: ServerProvider | null }) {
  if (!usesChatGptSharing(provider)) return null;
  return (
    <View className="flex-row items-center justify-between gap-3 px-3 py-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="已开启 ChatGPT 词元共享"
        className="min-h-11 flex-row items-center gap-2"
        onPress={() => {
          Dialog.alert(
            "已开启 ChatGPT 共享",
            [
              provider?.auth.email,
              "Eligible usage uses your ChatGPT plan. Credit settings and limits are managed in ChatGPT.",
              "Fast and Ultrafast are unavailable with this ChatGPT connection. Use an existing Codex CLI login for speed options your account supports.",
            ]
              .filter(Boolean)
              .join("\n\n"),
          );
        }}
      >
        <ProviderIcon provider="codex" size={14} />
        <Text className="text-xs text-foreground-muted">正在使用 ChatGPT 套餐</Text>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        className="min-h-11 justify-center"
        onPress={() => void Linking.openURL(CHATGPT_USAGE_URL).catch(() => undefined)}
      >
        <Text className="text-xs font-t3-medium text-primary">管理用量</Text>
      </Pressable>
    </View>
  );
}
