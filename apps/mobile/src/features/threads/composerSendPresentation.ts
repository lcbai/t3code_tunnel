import {
  alternateComposerDispatchAction,
  type ActiveTurnComposerAction,
} from "@t3tools/client-runtime/state/composer-dispatch";

import type { FollowUpBehavior } from "../../lib/followUpBehavior";

export interface ComposerSendPresentation {
  readonly label: string;
  readonly icon:
    | "arrow.up"
    | "tray.and.arrow.up"
    | "checkmark"
    | "list.number"
    | "arrow.turn.left.up";
  readonly action: ActiveTurnComposerAction | null;
  readonly alternate: ActiveTurnComposerAction | null;
  readonly offersFollowUpChoice: boolean;
}

const ACTION_LABEL: Record<ActiveTurnComposerAction, string> = {
  queue: "队列",
  steer: "引导",
  restart: "重启",
};

export function resolveComposerSendPresentation(input: {
  readonly editingQueuedMessage: boolean;
  readonly running: boolean;
  readonly canSteer: boolean;
  readonly followUpBehavior: FollowUpBehavior;
  readonly deliveryDeferred: boolean;
}): ComposerSendPresentation {
  if (input.editingQueuedMessage) {
    return {
      label: "更新待发送消息",
      icon: "checkmark",
      action: null,
      alternate: null,
      offersFollowUpChoice: false,
    };
  }
  if (!input.running) {
    return {
      label: input.deliveryDeferred ? "队列" : "发送",
      icon: input.deliveryDeferred ? "tray.and.arrow.up" : "arrow.up",
      action: null,
      alternate: null,
      offersFollowUpChoice: false,
    };
  }
  const action: ActiveTurnComposerAction = input.canSteer ? input.followUpBehavior : "queue";
  const alternate = alternateComposerDispatchAction(action);
  return {
    label: ACTION_LABEL[action],
    icon: action === "steer" ? "arrow.turn.left.up" : "list.number",
    action,
    alternate: input.canSteer ? alternate : null,
    offersFollowUpChoice: input.canSteer,
  };
}
