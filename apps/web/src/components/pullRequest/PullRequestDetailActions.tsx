import type {
  EnvironmentId,
  PullRequestAction,
  PullRequestMergeMethod,
  PullRequestUpdateMethod,
} from "@t3tools/contracts";
import { CheckIcon, ChevronDownIcon, FolderGit2Icon, GitBranchIcon, PlayIcon } from "lucide-react";
import type { ReactNode } from "react";

import { AnimatedWidth } from "~/components/AnimatedWidth";
import { cn } from "~/lib/utils";
import { EnvironmentMachineIcon } from "../EnvironmentMachineIcon";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { resolvePullRequestPrimaryControl } from "./pullRequestDetail.logic";
import { PullRequestGlyph } from "./pullRequestIcons";
import type { resolvePullRequestState } from "./pullRequestPresentation";
import type { PickableEnvironment } from "./pullRequestProjectAssignment.logic";
import { useInlineActionConfirm } from "./useInlineActionConfirm";

export type PerformPullRequestAction = (
  action: PullRequestAction,
  method?: PullRequestMergeMethod,
  updateMethod?: PullRequestUpdateMethod,
) => Promise<boolean>;

export function ActOnEnvironmentPicker({
  environments,
  value,
  onChange,
  disabled,
}: {
  environments: ReadonlyArray<PickableEnvironment>;
  value: EnvironmentId;
  onChange: (environmentId: EnvironmentId) => void;
  disabled: boolean;
}) {
  return (
    <>
      <MenuSeparator />
      <MenuRadioGroup
        value={value}
        onValueChange={(environmentId) => onChange(environmentId as EnvironmentId)}
      >
        {environments.map((environment) => (
          <MenuRadioItem
            key={environment.environmentId}
            value={environment.environmentId}
            disabled={disabled}
          >
            <span className="flex min-w-0 items-center gap-2">
              <EnvironmentMachineIcon
                kind={environment.machine ?? "server"}
                className="size-3.5 shrink-0"
              />
              <span className="truncate">{environment.label}</span>
            </span>
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    </>
  );
}

export function PullRequestCheckoutMenu({
  handoff,
  checkoutRoot,
  canPrepareWorktree,
  canCheckoutHere,
  onCheckout,
  pickableEnvironments,
  actingEnvironmentId,
  onActingEnvironmentChange,
  term,
}: {
  handoff: string | null;
  checkoutRoot: string | null;
  canPrepareWorktree: boolean;
  canCheckoutHere: boolean;
  onCheckout: (mode: "worktree" | "local") => void;
  pickableEnvironments: ReadonlyArray<PickableEnvironment>;
  actingEnvironmentId: EnvironmentId;
  onActingEnvironmentChange: (environmentId: EnvironmentId) => void;
  /** The host's word for a change request, as in "pull request". */
  term: string;
}) {
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              disabled={handoff !== null || checkoutRoot === null}
              render={
                <Button
                  size="xs"
                  variant="outline"
                  aria-label={handoff?.startsWith("checkout") ? "检查中…" : "检查出来"}
                >
                  <GitBranchIcon aria-hidden className="size-3.5" />
                  <span className="@max-[35rem]/pr-header:hidden">
                    {handoff?.startsWith("checkout") ? "检查中…" : "检查出来"}
                  </span>
                  <ChevronDownIcon aria-hidden className="size-3.5 text-muted-foreground" />
                </Button>
              }
            />
          }
        />
        <TooltipPopup>看这个 {term}</TooltipPopup>
      </Tooltip>
      <MenuPopup align="end" side="bottom">
        <MenuItem disabled={!canPrepareWorktree} onClick={() => onCheckout("worktree")}>
          <GitBranchIcon className="mt-1 size-3.5 shrink-0 self-start" />
          <span className="flex min-w-0 flex-col">
            <span>在一个单独的工作树上,</span>
            <span className="text-xs text-muted-foreground">
              它自己的文件夹和会话。您没有打开的动作。
            </span>
          </span>
        </MenuItem>
        <MenuItem disabled={!canCheckoutHere} onClick={() => onCheckout("local")}>
          <FolderGit2Icon className="mt-1 size-3.5 shrink-0 self-start" />
          <span className="flex min-w-0 flex-col">
            <span>在此寄存器中</span>
            <span className="text-xs text-muted-foreground">切换你工作的分支。</span>
          </span>
        </MenuItem>
        {pickableEnvironments.length > 0 ? (
          <ActOnEnvironmentPicker
            environments={pickableEnvironments}
            value={actingEnvironmentId}
            onChange={onActingEnvironmentChange}
            disabled={handoff !== null}
          />
        ) : null}
      </MenuPopup>
    </Menu>
  );
}

export function PullRequestResolveConflictsButton({
  handoff,
  unavailable,
  onResolve,
}: {
  handoff: string | null;
  unavailable: boolean;
  onResolve: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex shrink-0">
            <Button
              size="xs"
              variant="destructive-outline"
              disabled={handoff !== null || unavailable}
              onClick={onResolve}
              aria-label={handoff === "conflicts" ? "准备…" : "解决冲突"}
            >
              <PullRequestGlyph.conflicting aria-hidden className="size-3.5" />
              <span className="@max-[30rem]/pr-header:hidden">
                {handoff === "conflicts" ? "准备…" : "解决冲突"}
              </span>
            </Button>
          </span>
        }
      />
      <TooltipPopup side="top">{handoff === "conflicts" ? "准备…" : "解决冲突"}</TooltipPopup>
    </Tooltip>
  );
}

/** The header's one prominent control, which depends on where the pull request stands. */
export function PullRequestPrimaryAction({
  pullRequestKey,
  primaryAction,
  mergeBlockedReason,
  autoMergeArmed,
  armedAutoMergeLabel,
  pendingAutoMergeLabel,
  selectedMergeMethod,
  selectedMergeMethodLabel,
  statePresentation,
  pendingAction,
  perform,
  resolveConflicts,
}: {
  pullRequestKey: string;
  primaryAction: ReturnType<typeof resolvePullRequestPrimaryControl> | null;
  mergeBlockedReason: string | null;
  autoMergeArmed: boolean;
  armedAutoMergeLabel: string;
  pendingAutoMergeLabel: string;
  selectedMergeMethod: PullRequestMergeMethod;
  selectedMergeMethodLabel: string;
  statePresentation: ReturnType<typeof resolvePullRequestState> | null;
  pendingAction: PullRequestAction | null;
  perform: PerformPullRequestAction;
  resolveConflicts: ReactNode;
}) {
  const inlineConfirm = useInlineActionConfirm(pullRequestKey);
  const actionPending = pendingAction !== null;
  return (
    <>
      {autoMergeArmed && primaryAction !== "auto-merge-armed" ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Badge size="control" variant="info" role="img" aria-label={armedAutoMergeLabel}>
                <PullRequestGlyph.merged aria-hidden className="size-3.5" />
                <span className="@max-[30rem]/pr-header:hidden">{armedAutoMergeLabel}</span>
              </Badge>
            }
          />
          <TooltipPopup side="top">
            {armedAutoMergeLabel}:一旦满足要求，托管平台将自行合并此功能
          </TooltipPopup>
        </Tooltip>
      ) : null}
      {primaryAction === "resolve" ? (
        resolveConflicts
      ) : primaryAction === "ready" ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex shrink-0">
                <Button
                  size="xs"
                  variant="default"
                  disabled={actionPending}
                  onClick={() => void perform("ready")}
                  aria-label="准备接受审查"
                >
                  <PullRequestGlyph.pullRequest aria-hidden className="size-3.5" />
                  <span className="@max-[30rem]/pr-header:hidden">准备接受审查</span>
                </Button>
              </span>
            }
          />
          <TooltipPopup side="top">准备接受审查</TooltipPopup>
        </Tooltip>
      ) : primaryAction === "enable-auto-merge" ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex shrink-0">
                <Button
                  size="xs"
                  variant="default"
                  disabled={actionPending}
                  aria-disabled={mergeBlockedReason !== null || undefined}
                  aria-description={mergeBlockedReason ?? undefined}
                  {...(mergeBlockedReason === null
                    ? inlineConfirm.props(
                        "enable-auto-merge",
                        () => void perform("enable-auto-merge", selectedMergeMethod),
                      )
                    : {})}
                  aria-label={
                    pendingAction === "enable-auto-merge"
                      ? "正在启用…"
                      : inlineConfirm.isArmed("enable-auto-merge")
                        ? "确定自动出现吗?"
                        : pendingAutoMergeLabel
                  }
                >
                  {inlineConfirm.isArmed("enable-auto-merge") ? (
                    <CheckIcon aria-hidden className="size-3.5" />
                  ) : (
                    <PullRequestGlyph.merged aria-hidden className="size-3.5" />
                  )}
                  <AnimatedWidth className="@max-[30rem]/pr-header:hidden">
                    <span className="grid">
                      <span aria-hidden className="invisible col-start-1 row-start-1">
                        {pendingAutoMergeLabel}
                      </span>
                      <span className="col-start-1 row-start-1">
                        {pendingAction === "enable-auto-merge"
                          ? "正在启用…"
                          : inlineConfirm.isArmed("enable-auto-merge")
                            ? "确定自动出现吗?"
                            : pendingAutoMergeLabel}
                      </span>
                    </span>
                  </AnimatedWidth>
                </Button>
              </span>
            }
          />
          <TooltipPopup side="top">
            {mergeBlockedReason ??
              (pendingAction === "enable-auto-merge"
                ? "正在启用…"
                : inlineConfirm.isArmed("enable-auto-merge")
                  ? "确定自动出现吗?"
                  : pendingAutoMergeLabel)}
          </TooltipPopup>
        </Tooltip>
      ) : primaryAction === "auto-merge-armed" ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Badge size="control" variant="info" role="img" aria-label={armedAutoMergeLabel}>
                <PullRequestGlyph.merged aria-hidden className="size-3.5" />
                <span className="@max-[30rem]/pr-header:hidden">{armedAutoMergeLabel}</span>
              </Badge>
            }
          />
          <TooltipPopup side="top">
            {armedAutoMergeLabel}:一旦满足要求，托管平台将自行合并此功能
          </TooltipPopup>
        </Tooltip>
      ) : primaryAction === "merge" ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex shrink-0">
                <Button
                  size="xs"
                  variant="default"
                  disabled={actionPending}
                  aria-disabled={mergeBlockedReason !== null || undefined}
                  aria-description={mergeBlockedReason ?? undefined}
                  {...(mergeBlockedReason === null
                    ? inlineConfirm.props("merge", () => void perform("merge", selectedMergeMethod))
                    : {})}
                  aria-label={
                    pendingAction === "merge"
                      ? "合并中…"
                      : inlineConfirm.isArmed("merge")
                        ? "确认合并吗 ?"
                        : selectedMergeMethodLabel
                  }
                >
                  {inlineConfirm.isArmed("merge") ? (
                    <CheckIcon aria-hidden className="size-3.5" />
                  ) : (
                    <PullRequestGlyph.merged aria-hidden className="size-3.5" />
                  )}
                  <AnimatedWidth className="@max-[30rem]/pr-header:hidden">
                    <span className="grid">
                      <span aria-hidden className="invisible col-start-1 row-start-1">
                        {selectedMergeMethodLabel}
                      </span>
                      <span className="col-start-1 row-start-1">
                        {pendingAction === "merge"
                          ? "合并中…"
                          : inlineConfirm.isArmed("merge")
                            ? "确认合并吗 ?"
                            : selectedMergeMethodLabel}
                      </span>
                    </span>
                  </AnimatedWidth>
                </Button>
              </span>
            }
          />
          <TooltipPopup side="top">
            {mergeBlockedReason ??
              (pendingAction === "merge"
                ? "合并中…"
                : inlineConfirm.isArmed("merge")
                  ? "确认合并吗 ?"
                  : selectedMergeMethodLabel)}
          </TooltipPopup>
        </Tooltip>
      ) : (primaryAction === "merged" || primaryAction === "closed") &&
        statePresentation !== null ? (
        <Badge size="control" variant="outline">
          <span className={cn("flex items-center gap-1", statePresentation.toneClassName)}>
            <statePresentation.Icon className="size-3.5" />
            {statePresentation.label}
          </span>
        </Badge>
      ) : null}
    </>
  );
}

export function PullRequestApproveWorkflowsButton({
  pullRequestKey,
  pendingAction,
  perform,
}: {
  pullRequestKey: string;
  pendingAction: PullRequestAction | null;
  perform: PerformPullRequestAction;
}) {
  const inlineConfirm = useInlineActionConfirm(pullRequestKey);
  const actionPending = pendingAction !== null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="ml-auto inline-flex shrink-0">
            <Button
              size="xs"
              variant="warning-outline"
              disabled={actionPending}
              {...inlineConfirm.props("approve-workflows", () => void perform("approve-workflows"))}
              aria-label={
                pendingAction === "approve-workflows"
                  ? "核准…"
                  : inlineConfirm.isArmed("approve-workflows")
                    ? "确认同意吗?"
                    : "核准运行工作流程"
              }
            >
              <PlayIcon aria-hidden className="size-3.5" />
              <span className="inline-grid">
                <span aria-hidden className="invisible col-start-1 row-start-1">
                  核准运行工作流程
                </span>
                <span aria-hidden className="invisible col-start-1 row-start-1">
                  确认同意吗?
                </span>
                <span className="col-start-1 row-start-1">
                  {pendingAction === "approve-workflows"
                    ? "核准…"
                    : inlineConfirm.isArmed("approve-workflows")
                      ? "确认同意吗?"
                      : "核准运行工作流程"}
                </span>
              </span>
            </Button>
          </span>
        }
      />
      <TooltipPopup side="top">
        {pendingAction === "approve-workflows"
          ? "核准…"
          : inlineConfirm.isArmed("approve-workflows")
            ? "确认同意吗?"
            : "核准运行工作流程"}
      </TooltipPopup>
    </Tooltip>
  );
}
