import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import type { DesktopSshPasswordPromptRequest } from "@t3tools/contracts";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Cause from "effect/Cause";
import { useId, useRef, useState, useSyncExternalStore } from "react";

import { useDeadlinePassed } from "../../hooks/useDeadline";
import { useNowSecond } from "../../hooks/useNowSecond";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";

function describeSshTarget(request: DesktopSshPasswordPromptRequest): string {
  return request.username ? `${request.username}@${request.destination}` : request.destination;
}

function formatRemainingSeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function getPromptErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "SSH verification prompt failed.";
  return message.includes("expired") || message.includes("no longer pending")
    ? "此SSH 校验提示已过期。再次尝试连接。"
    : message;
}

let promptQueue: readonly DesktopSshPasswordPromptRequest[] = [];
const promptQueueListeners = new Set<() => void>();

function setPromptQueue(next: readonly DesktopSshPasswordPromptRequest[]) {
  promptQueue = next;
  for (const listener of promptQueueListeners) listener();
}

/**
 * Queues the desktop's SSH password prompts for the life of the page, so a prompt
 * that arrives while no dialog is mounted still waits for one.
 */
export function startSshPasswordPromptQueue(): () => void {
  return (
    window.desktopBridge?.onSshPasswordPrompt((request) => {
      setPromptQueue([...promptQueue, request]);
    }) ?? (() => undefined)
  );
}

function subscribePromptQueue(listener: () => void): () => void {
  promptQueueListeners.add(listener);
  return () => {
    promptQueueListeners.delete(listener);
  };
}

const readPromptQueue = () => promptQueue;

function removeSshPasswordPrompt(requestId: string) {
  if (promptQueue[0]?.requestId === requestId) setPromptQueue(promptQueue.slice(1));
}

export function SshPasswordPromptDialog() {
  const queue = useSyncExternalStore(subscribePromptQueue, readPromptQueue, readPromptQueue);
  const currentRequest = queue[0] ?? null;

  if (!currentRequest) {
    return null;
  }

  return <ActiveSshPasswordPrompt key={currentRequest.requestId} request={currentRequest} />;
}

function ActiveSshPasswordPrompt({
  request,
}: {
  readonly request: DesktopSshPasswordPromptRequest;
}) {
  const [password, setPassword] = useState("");
  const [isResponding, setIsResponding] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isRespondingRef = useRef(false);
  const formId = useId();

  const expiresAtMs = Date.parse(request.expiresAt);
  const now = useNowSecond();
  const isExpired = useDeadlinePassed(Number.isFinite(expiresAtMs) ? expiresAtMs : null);
  const remainingMs = Number.isFinite(expiresAtMs)
    ? isExpired
      ? 0
      : Math.max(0, expiresAtMs - now)
    : null;
  const remainingSeconds = remainingMs === null ? null : Math.ceil(remainingMs / 1_000);
  const remainingLabel =
    remainingSeconds === null ? null : formatRemainingSeconds(remainingSeconds);
  const visibleResponseError = isExpired ? "此SSH 校验提示已过期。再次尝试连接。" : responseError;

  const respond = async (nextPassword: string | null) => {
    if (isRespondingRef.current) {
      return;
    }

    const requestId = request.requestId;
    if (nextPassword !== null && isExpired) {
      setResponseError("此SSH 校验提示已过期。再次尝试连接。");
      return;
    }

    isRespondingRef.current = true;
    setIsResponding(true);
    setResponseError(null);
    const result = await settlePromise(async () =>
      window.desktopBridge?.resolveSshPasswordPrompt(requestId, nextPassword),
    );
    if (AsyncResult.isSuccess(result) || nextPassword === null) {
      removeSshPasswordPrompt(requestId);
    } else {
      setResponseError(getPromptErrorMessage(Cause.squash(result.cause)));
    }
    isRespondingRef.current = false;
    setIsResponding(false);
  };

  const dismissExpiredPrompt = () => {
    removeSshPasswordPrompt(request.requestId);
  };

  const cancelPrompt = () => {
    if (isExpired) {
      dismissExpiredPrompt();
      return;
    }
    void respond(null);
  };

  const target = describeSshTarget(request);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          cancelPrompt();
        }
      }}
    >
      <DialogPopup className="max-w-md" initialFocus={inputRef} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>SSH 需要验证</DialogTitle>
          <DialogDescription>
            输入所需的密码或校验代码 <code>{target}</code>.T3 Code 将您的回复传递给本地的SSH
            进程，并保存在内存中以用于此主机的再使用。T3 Code不将其写入磁盘。
          </DialogDescription>
        </DialogHeader>
        <DialogPanel scrollFade={false}>
          <form
            className="space-y-3"
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              void respond(password);
            }}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{request.prompt}</p>
                {remainingLabel ? (
                  <span
                    className={
                      isExpired
                        ? "shrink-0 text-xs font-medium text-destructive"
                        : "shrink-0 text-xs text-muted-foreground"
                    }
                  >
                    {isExpired ? "过期" : remainingLabel}
                  </span>
                ) : null}
              </div>
              <Input
                ref={inputRef}
                autoComplete="current-password"
                disabled={isResponding || isExpired}
                name="ssh-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {visibleResponseError ? (
              <p className="text-sm text-destructive">{visibleResponseError}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                SSH 密钥可能替换密码，但您的服务器仍然需要验证代码。
              </p>
            )}
          </form>
        </DialogPanel>
        <DialogFooter>
          <Button disabled={isResponding} type="button" variant="outline" onClick={cancelPrompt}>
            {isExpired ? "开除" : "取消"}
          </Button>
          <Button disabled={isResponding || isExpired} form={formId} type="submit">
            继续
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
