import { View } from "react-native";

import { Notice } from "../../components/ui/Notice";
import { setFreshSessionPending, useComposerDraftSettings } from "../../state/use-composer-drafts";

/** Shown while `/clear` is armed; dismissing it keeps the current session. */
export function FreshSessionNotice(props: { readonly threadKey: string }) {
  if (useComposerDraftSettings(props.threadKey).freshContext !== true) return null;
  return (
    <View className="px-4 pb-3">
      <Notice
        message="下一条消息会开启全新会话，智能体无法看到此会话中先前的消息。"
        icon="arrow.clockwise"
        floating
        onDismiss={() => setFreshSessionPending(props.threadKey, false)}
        dismissLabel="Keep the current session"
      />
    </View>
  );
}
