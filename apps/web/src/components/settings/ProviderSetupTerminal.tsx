import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  AuthTerminalOperateScope,
  type EnvironmentId,
  type ProviderInstanceId,
  type ServerConfig,
  ThreadId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { useEffect, useRef, useState } from "react";

import { TYPOGRAPHY_ADVANCED_STORAGE_KEY } from "../../appearanceFonts";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { cn, randomUUID } from "../../lib/utils";
import { readEnvironmentScope, useEnvironmentScope } from "../../state/session";
import { terminalEnvironment } from "../../state/terminal";
import { useAtomCommand } from "../../state/use-atom-command";
import { TerminalViewport } from "../ThreadTerminalDrawer";
import { Button } from "../ui/button";

const AGENT_ONBOARDING_THREAD_ID = ThreadId.make("onboarding-agent-setup");

export function ProviderSetupTerminal({
  command,
  cwd,
  environmentId,
  keybindings,
  terminalLabel,
  providerInstanceId,
  onClose,
  runImmediately = false,
  layout = "inline",
}: {
  readonly command: string;
  readonly cwd: string;
  readonly environmentId: EnvironmentId;
  readonly keybindings: ServerConfig["keybindings"];
  readonly terminalLabel: string;
  readonly providerInstanceId?: ProviderInstanceId;
  readonly onClose: () => void;
  readonly runImmediately?: boolean;
  readonly layout?: "inline" | "dialog";
}) {
  const canOperateTerminal = useEnvironmentScope(environmentId, AuthTerminalOperateScope);
  const [advancedTypography] = useLocalStorage(
    TYPOGRAPHY_ADVANCED_STORAGE_KEY,
    false,
    Schema.Boolean,
  );
  const openTerminal = useAtomCommand(terminalEnvironment.open, { reportFailure: false });
  const writeTerminal = useAtomCommand(terminalEnvironment.write, { reportFailure: false });
  const closeTerminal = useAtomCommand(terminalEnvironment.close, { reportFailure: false });
  const setupQueueRef = useRef(Promise.resolve());
  const setupGenerationRef = useRef(0);
  const activeSetupGenerationRef = useRef<number | null>(null);
  const initialResizeRef = useRef<((success: boolean) => void) | null>(null);
  const [terminalId] = useState(() => `onboarding-${randomUUID()}`);
  const threadRef = scopeThreadRef(environmentId, AGENT_ONBOARDING_THREAD_ID);
  const [setupAttempt, setSetupAttempt] = useState(0);
  const [setupState, setSetupState] = useState<
    "preparing" | "sizing" | "ready" | "openFailed" | "resizeFailed" | "writeFailed"
  >("preparing");
  const showTerminal =
    setupState === "sizing" ||
    setupState === "ready" ||
    setupState === "resizeFailed" ||
    setupState === "writeFailed";

  // StrictMode can finish a cancelled open after replacement setup; it must not close or pre-type into that
  // session.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- opens the setup PTY, types the command into it, and closes it on cleanup
  useEffect(() => {
    const generation = setupGenerationRef.current + 1;
    setupGenerationRef.current = generation;
    activeSetupGenerationRef.current = generation;
    // oxlint-disable-next-line react/set-state-in-effect -- A retry or a new command reopens the terminal, which shows as preparing until the open settles.
    setSetupState("preparing");

    setupQueueRef.current = setupQueueRef.current.then(async () => {
      if (activeSetupGenerationRef.current !== generation) return;
      if (!readEnvironmentScope(environmentId, AuthTerminalOperateScope)) {
        setSetupState("openFailed");
        return;
      }
      const opened = await openTerminal({
        environmentId,
        input: {
          threadId: AGENT_ONBOARDING_THREAD_ID,
          terminalId,
          cwd,
          ...(providerInstanceId === undefined ? {} : { providerInstanceId }),
        },
      });
      if (opened._tag !== "Success") {
        if (activeSetupGenerationRef.current === generation) setSetupState("openFailed");
        return;
      }

      if (activeSetupGenerationRef.current !== generation) return;
      // The QR can wrap if it prints before the PTY knows the size of the popup.
      const sized =
        layout !== "dialog" ||
        (await new Promise<boolean>((resolve) => {
          initialResizeRef.current = resolve;
          setSetupState("sizing");
        }));
      if (activeSetupGenerationRef.current !== generation) return;
      if (!sized) {
        setSetupState("resizeFailed");
        return;
      }
      if (!readEnvironmentScope(environmentId, AuthTerminalOperateScope)) {
        setSetupState("writeFailed");
        return;
      }

      const wrote = await writeTerminal({
        environmentId,
        input: {
          threadId: AGENT_ONBOARDING_THREAD_ID,
          terminalId,
          data: runImmediately ? `${command}\r` : command,
        },
      });
      if (activeSetupGenerationRef.current !== generation) return;
      setSetupState(wrote._tag === "Success" ? "ready" : "writeFailed");
    });

    // Revocation leaves the PTY running; close only while terminal access remains.
    return () => {
      if (activeSetupGenerationRef.current === generation) {
        activeSetupGenerationRef.current = null;
        initialResizeRef.current?.(false);
        initialResizeRef.current = null;
      }
      setupQueueRef.current = setupQueueRef.current.then(async () => {
        if (!readEnvironmentScope(environmentId, AuthTerminalOperateScope)) return;
        await closeTerminal({
          environmentId,
          input: { threadId: AGENT_ONBOARDING_THREAD_ID, terminalId, deleteHistory: true },
        });
      });
    };
  }, [
    closeTerminal,
    command,
    cwd,
    environmentId,
    layout,
    openTerminal,
    providerInstanceId,
    runImmediately,
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Retry bumps setupAttempt to open the terminal again.
    setupAttempt,
    terminalId,
    writeTerminal,
  ]);

  return (
    <div
      data-thread-terminal-drawer
      className={cn(
        "overflow-hidden rounded-lg border border-border/70 bg-background text-foreground",
        layout === "inline" && "mt-4",
      )}
    >
      <div className="flex items-center justify-between border-b border-border/60 bg-background/60 px-3 py-1.5">
        <span className="text-2xs font-medium text-muted-foreground">
          {!canOperateTerminal ? (
            "此连接无法控制终端。"
          ) : setupState === "writeFailed" ? (
            <>
              运行 <code className="rounded bg-muted px-1 font-mono">{command}</code> 在这个终端。
            </>
          ) : setupState === "ready" ? (
            runImmediately ? (
              "终端已就绪。"
            ) : (
              "审查命令，然后按 Enter 操作它。"
            )
          ) : setupState === "openFailed" ? (
            "无法打开设置终端。"
          ) : setupState === "resizeFailed" ? (
            "无法准备扫码终端。请关闭弹窗后重试。"
          ) : (
            "正在准备命令…"
          )}
        </span>
        <div className="flex items-center gap-1">
          {setupState === "openFailed" ? (
            <Button
              size="xs"
              variant="ghost"
              disabled={!canOperateTerminal}
              onClick={() => {
                if (readEnvironmentScope(environmentId, AuthTerminalOperateScope)) {
                  setSetupAttempt((value) => value + 1);
                }
              }}
            >
              重试
            </Button>
          ) : null}
          {layout === "inline" ? (
            <Button size="xs" variant="ghost-muted" onClick={onClose}>
              关闭
            </Button>
          ) : null}
        </div>
      </div>
      <div className={layout === "dialog" ? "h-[clamp(17rem,60dvh,30rem)]" : "h-64"}>
        {showTerminal ? (
          <TerminalViewport
            threadRef={threadRef}
            threadId={AGENT_ONBOARDING_THREAD_ID}
            terminalId={terminalId}
            terminalLabel={terminalLabel}
            cwd={cwd}
            {...(providerInstanceId === undefined ? {} : { providerInstanceId })}
            advancedTypography={advancedTypography}
            onSessionExited={onClose}
            {...(layout === "dialog"
              ? {
                  fontSize: 12,
                  onResized: (success: boolean) => {
                    initialResizeRef.current?.(success);
                    initialResizeRef.current = null;
                  },
                }
              : {})}
            autoFocus
            visible
            keybindings={keybindings}
          />
        ) : null}
      </div>
    </div>
  );
}
