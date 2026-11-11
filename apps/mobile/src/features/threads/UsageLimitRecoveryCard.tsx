import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { AsyncResult } from "effect/reactivity";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { limitRecoveryOwnsSnooze } from "@t3tools/client-runtime/state/thread-execution";
import type { EnvironmentId } from "@t3tools/contracts";
import {
  CHATGPT_USAGE_LIMIT_CODE,
  CHATGPT_USAGE_URL,
  CHATGPT_WORKSPACE_ADMIN_REQUEST,
  CHATGPT_WORKSPACE_USAGE_LIMIT_CODE,
} from "@t3tools/shared/usageLimits";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { ProviderIcon } from "../../components/ProviderIcon";
import { AppText as Text } from "../../components/ui/AppText";
import { useDeadlinePassed } from "../../lib/clock";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";

export function UsageLimitRecoveryCard({
  thread,
  environmentId,
}: {
  thread: EnvironmentThreadShell;
  environmentId: EnvironmentId;
}) {
  const updateMetadata = useAtomCommand(threadEnvironment.updateMetadata);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resetAt = thread.runtime?.usageLimitResetAt ?? null;
  const canSchedule =
    thread.settledOverride !== "settled" &&
    resetAt !== null &&
    Date.parse(resetAt) > Date.parse(thread.latestRun?.completedAt ?? thread.updatedAt);
  const resetPassed = useDeadlinePassed(resetAt === null ? null : Date.parse(resetAt));
  const runId = thread.latestRun?.runId;
  const recovery = thread.limitRecovery;
  const scheduled =
    recovery?.runId === runId && recovery?.resetAt === resetAt && recovery?.autoResume;
  const displayAt =
    canSchedule &&
    scheduled &&
    resetAt &&
    thread.snoozedUntil &&
    Date.parse(thread.snoozedUntil) > Date.parse(resetAt)
      ? thread.snoozedUntil
      : resetAt;
  const [copied, setCopied] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const code = thread.runtime?.lastErrorCode;
  // OpenAI's partner guidelines specify the ChatGPT notice and its action.
  const workspaceLimit = code === CHATGPT_WORKSPACE_USAGE_LIMIT_CODE;
  const chatGptLimit = workspaceLimit || code === CHATGPT_USAGE_LIMIT_CODE;
  if (
    thread.runtime?.status !== "failed" ||
    // Older servers report ChatGPT sharing limits as provider errors.
    (thread.runtime.lastErrorClass !== "usage_limit" && !chatGptLimit) ||
    !runId
  )
    return null;
  const resetText = displayAt
    ? `${canSchedule && scheduled ? "恢复时间：" : "重置时间："} ${new Date(
        displayAt,
      ).toLocaleString("zh-CN", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}.`
    : null;
  const snoozed =
    limitRecoveryOwnsSnooze({
      runId,
      resetAt,
      recovery,
      snoozedUntil: thread.snoozedUntil,
    }) && !resetPassed;
  async function toggle(action: "resume" | "snooze") {
    if (!resetAt || !runId || !canSchedule) return;
    if (action === "snooze" && !snoozed && Date.parse(resetAt) <= Date.now()) {
      setError("The reset time has passed. Retry the thread manually.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await updateMetadata({
      environmentId,
      input: {
        threadId: thread.id,
        limitRecovery: {
          runId,
          resetAt,
          ...(action === "resume" ? { autoResume: !scheduled } : { snooze: !snoozed }),
        },
      },
    });
    setPending(false);
    if (AsyncResult.isFailure(result)) {
      const cause = squashAtomCommandFailure(result);
      setError(cause instanceof Error ? cause.message : "Could not change limit recovery.");
    }
  }
  const action = workspaceLimit
    ? {
        label: "复制请求以发给管理员",
        role: "button" as const,
        run: () => {
          setError(null);
          setCopied(false);
          setActionPending(true);
          void Clipboard.setStringAsync(CHATGPT_WORKSPACE_ADMIN_REQUEST)
            .then(
              () => setCopied(true),
              () => setError("Could not copy the request. Try again."),
            )
            .finally(() => setActionPending(false));
        },
      }
    : {
        label: "管理用量",
        role: "link" as const,
        run: () => {
          setError(null);
          setActionPending(true);
          void Linking.openURL(CHATGPT_USAGE_URL)
            .catch(() => setError("Could not open ChatGPT. Go to chatgpt.com → Settings → Usage."))
            .finally(() => setActionPending(false));
        },
      };
  return (
    <View
      accessibilityRole={chatGptLimit ? "alert" : undefined}
      className="mx-3 mb-2 flex-row gap-2 rounded-xl border border-warning-foreground/25 bg-screen p-3"
    >
      {chatGptLimit ? (
        <View className="pt-0.5">
          <ProviderIcon provider="codex" size={16} />
        </View>
      ) : null}
      <View className="min-w-0 flex-1 gap-1">
        {chatGptLimit ? (
          <Text className="text-sm font-t3-medium text-foreground">已达到 ChatGPT 用量上限</Text>
        ) : null}
        <Text
          className={
            chatGptLimit ? "text-sm text-foreground-muted" : "text-sm text-warning-foreground"
          }
        >
          {workspaceLimit
            ? copied
              ? "请求已复制。请发送给你的工作区管理员。"
              : "你已达到工作区中其他应用共享 ChatGPT 套餐的用量上限。请复制请求并发送给工作区管理员，以申请提高限额。"
            : chatGptLimit
              ? (resetText ?? "请在 ChatGPT 中查看用量设置。")
              : resetText
                ? `已达到用量上限。${resetText}`
                : "已达到用量上限。提供方未报告重置时间，请在额度恢复后手动重试。"}
        </Text>
        {chatGptLimit || canSchedule ? (
          // The margins cancel the 44pt touch height so the links sit 8pt under the text.
          <View className="-mb-3 -mt-2 flex-row flex-wrap gap-x-4">
            {chatGptLimit ? (
              <RecoveryAction
                label={action.label}
                role={action.role}
                disabled={actionPending}
                onPress={action.run}
              />
            ) : null}
            {canSchedule ? (
              <>
                <RecoveryAction
                  label={scheduled ? "取消自动恢复" : "额度重置时恢复"}
                  disabled={pending}
                  onPress={() => void toggle("resume")}
                />
                <RecoveryAction
                  label={snoozed ? "立即唤醒" : "推迟至重置"}
                  disabled={pending || (!snoozed && resetPassed)}
                  onPress={() => void toggle("snooze")}
                />
              </>
            ) : null}
          </View>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {error}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function RecoveryAction(props: {
  readonly label: string;
  readonly role?: "button" | "link";
  readonly disabled: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={props.role ?? "button"}
      accessibilityState={{ disabled: props.disabled }}
      disabled={props.disabled}
      hitSlop={{ left: 8, right: 8 }}
      onPress={props.onPress}
      className="min-h-11 justify-center active:opacity-70"
    >
      <Text
        className={
          props.disabled
            ? "text-sm font-t3-medium text-foreground-muted"
            : "text-sm font-t3-medium text-primary"
        }
      >
        {props.label}
      </Text>
    </Pressable>
  );
}
