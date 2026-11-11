import type { OrchestrationV2UserMessageInputIntent } from "@t3tools/contracts";

export interface UserMessageIntentBadgePresentation {
  readonly label: string;
  readonly accessibilityLabel: string;
}

export function resolveUserMessageIntentBadge(
  intent: OrchestrationV2UserMessageInputIntent | undefined,
): UserMessageIntentBadgePresentation | null {
  switch (intent) {
    case "steer":
      return {
        label: "引导",
        accessibilityLabel: "已引导当前轮次",
      };
    case "promoted_queued_to_steer":
      return {
        label: "引导",
        accessibilityLabel: "最初在队列中等待，后来用于引导当前轮次",
      };
    case "queued_turn":
    case "turn_start":
    case undefined:
      return null;
  }
}
