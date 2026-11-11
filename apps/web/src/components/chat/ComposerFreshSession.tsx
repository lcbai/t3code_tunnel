import { EraserIcon } from "lucide-react";

import type { ComposerBannerStackItem } from "./ComposerBannerStack";

/** Shown while `/clear` is armed; dismissing it keeps the current conversation. */
export function freshSessionBannerItem(onUndo: () => void): ComposerBannerStackItem {
  return {
    id: "fresh-session",
    variant: "info",
    icon: <EraserIcon />,
    title: "您的下一个消息开始新的会话",
    description: "代理商不会在这个会话中看到更早的消息。",
    dismissLabel: "Keep the current session",
    onDismiss: onUndo,
  };
}
