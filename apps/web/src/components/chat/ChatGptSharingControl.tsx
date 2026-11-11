import { usesChatGptSharing } from "@t3tools/shared/usageLimits";
import type { ServerProvider } from "@t3tools/contracts";
import { useId } from "react";
import { OpenAI } from "../Icons";
import { ChatGptUsageButton } from "../settings/ChatGptUsageButton";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const speedNotice =
  "快捷和 Ultrafast 无法使用此连接ChatGPT connection。 使用已有的Codex CLI 登录用于您的账户支持的快捷选项。";

export function ChatGptSharingControl({ provider }: { provider: ServerProvider | null }) {
  const speedNoticeId = useId();
  if (!usesChatGptSharing(provider)) return null;
  return (
    <div className="flex items-center justify-between gap-4 border-t px-3 py-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              aria-describedby={speedNoticeId}
              tabIndex={0}
              className="flex items-center gap-2 rounded-sm text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            />
          }
        >
          <OpenAI className="size-3.5" aria-hidden="true" />
          使用ChatGPT 计划
        </TooltipTrigger>
        <span id={speedNoticeId} className="sr-only">
          {speedNotice}
        </span>
        <TooltipPopup side="top">{speedNotice}</TooltipPopup>
      </Tooltip>
      <ChatGptUsageButton size="xs" />
    </div>
  );
}
