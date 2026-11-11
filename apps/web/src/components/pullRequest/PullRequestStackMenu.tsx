import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import type {
  EnvironmentId,
  PullRequestRef,
  PullRequestStack,
  PullRequestMergeMethod,
} from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";
import { useAtomCommand } from "~/state/use-atom-command";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { Button } from "../ui/button";
import { Menu, MenuPopup, MenuTrigger, MenuItem, MenuGroup, MenuSeparator } from "../ui/menu";
import {
  Dialog,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogFooter,
} from "../ui/dialog";
import { toastManager } from "../ui/toast";
import type { ChangeRequestTerminology } from "~/sourceControlPresentation";
import { PullRequestStackLayers } from "./PullRequestStackLayers";
import { PullRequestStackHeader } from "./PullRequestStackHeader";
import { PullRequestStackLayerContent } from "./PullRequestStackLayerContent";
import { PullRequestGlyph } from "./pullRequestIcons";
import { readableFailure } from "./pullRequestDetail.logic";

export function PullRequestStackMenu({
  hostLabel,
  terminology,
  stack,
  reference,
  environmentId,
  stale,
  canMerge,
  canRebase,
  mergeMethod,
  onSelect,
  onActed,
  notice,
  onRetry,
}: {
  hostLabel: string;
  terminology: ChangeRequestTerminology;
  notice?: string | null;
  onRetry?: (() => void) | undefined;
  stack: PullRequestStack;
  reference: PullRequestRef;
  environmentId: EnvironmentId;
  stale: boolean;
  canMerge: boolean;
  canRebase: boolean;
  mergeMethod: PullRequestMergeMethod;
  onSelect?: ((reference: PullRequestRef) => void) | undefined;
  onActed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<"merge" | "update-branch" | null>(null);
  const [pending, setPending] = useState(false);
  const runAction = useAtomCommand(pullRequestEnvironment.runAction, { reportFailure: false });
  const top = stack.layers.at(-1);
  const unmerged = stack.layers.filter((layer) => layer.state !== "merged");
  const hasClosed = unmerged.some((layer) => layer.state !== "open");
  const position = stack.layers.findIndex((layer) => layer.number === reference.number) + 1;
  const mergeLayers = stack.layers.slice(0, position).filter((layer) => layer.state !== "merged");
  const selectedLayer = stack.layers[position - 1];
  const mergeHasClosed = mergeLayers.some((layer) => layer.state !== "open");
  const expectedStackHeads = unmerged.flatMap((layer) =>
    layer.headSha ? [{ number: layer.number, headSha: layer.headSha }] : [],
  );
  const hasUnknownHead = expectedStackHeads.length !== unmerged.length;
  const mergeDisabled =
    pending ||
    stale ||
    selectedLayer?.state !== "open" ||
    mergeLayers.some((layer) => !layer.headSha) ||
    mergeHasClosed ||
    mergeLayers.length === 0 ||
    mergeLayers.some((layer) => layer.isDraft);
  const rebaseDisabled = pending || stale || hasUnknownHead || hasClosed || unmerged.length === 0;
  const run = async () => {
    if (
      pending ||
      !confirmation ||
      (confirmation === "merge" ? !canMerge || mergeDisabled : !canRebase || rebaseDisabled)
    )
      return;
    const action = confirmation;
    const target = action === "merge" ? selectedLayer : top;
    if (!target?.headSha) return;
    const actionHeads = (action === "merge" ? mergeLayers : unmerged).flatMap((layer) =>
      layer.headSha ? [{ number: layer.number, headSha: layer.headSha }] : [],
    );
    setPending(true);
    setConfirmation(null);
    const toastId = toastManager.add({
      type: "loading",
      title: action === "merge" ? "正在合并堆栈…" : "正在对堆栈变基…",
    });
    const result = await runAction({
      environmentId,
      input: {
        ...reference,
        number: target.number,
        stackNumber: stack.number,
        expectedStackHeads: actionHeads,
        action,
        ...(action === "merge" ? { mergeMethod } : { updateMethod: "rebase" }),
      },
    });
    setPending(false);
    onActed();
    if (result._tag === "Failure") {
      toastManager.update(toastId, {
        type: "error",
        title: action === "merge" ? "无法合并堆栈" : "无法对堆栈变基",
        description: readableFailure(
          squashAtomCommandFailure(result),
          action === "merge"
            ? "托管平台拒绝了合并。请确认你有写入权限、所需检查已通过，且分支没有冲突。"
            : "托管平台拒绝了变基。变基会在遇到第一个无法应用的提交时停止。",
        ),
      });
    } else {
      toastManager.update(toastId, {
        type: "success",
        title: action === "merge" ? "堆叠合并请求完成" : "堆栈重置基础",
        description: action === "merge" ? `${hostLabel} 合并堆栈或添加到其合并队列中。` : undefined,
      });
    }
  };
  const confirmationLayers = confirmation === "merge" ? mergeLayers : unmerged;
  return (
    <>
      <Menu open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <MenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="xs"
                    aria-label={`堆栈 #${stack.number}，第 ${position} 层，共 ${stack.layers.length} 层`}
                  />
                }
              >
                <PullRequestGlyph.stack aria-hidden className="size-3.5" /> {position}/
                {stack.layers.length}
                {onRetry ? <TriangleAlertIcon aria-hidden className="size-3 text-warning" /> : null}
              </MenuTrigger>
            }
          />
          <TooltipPopup>
            查看堆栈 #{stack.number}，第 {position} 层，共 {stack.layers.length} 层
            {notice ? ` · ${notice}` : null}
          </TooltipPopup>
        </Tooltip>
        <MenuPopup align="start">
          <MenuGroup>
            <PullRequestStackHeader number={stack.number} notice={notice} stale={!!onRetry} />
            {onRetry ? <MenuItem onClick={onRetry}>重试堆栈刷新</MenuItem> : null}
            <PullRequestStackLayers
              stack={stack}
              reference={reference}
              pending={pending}
              onSelect={
                onSelect
                  ? (target) => {
                      setOpen(false);
                      onSelect(target);
                    }
                  : undefined
              }
            />
          </MenuGroup>
          {canMerge || canRebase ? (
            <>
              <MenuSeparator />
              {canMerge ? (
                <MenuItem disabled={mergeDisabled} onClick={() => setConfirmation("merge")}>
                  <PullRequestGlyph.merged aria-hidden />
                  合并堆栈（{mergeLayers.length} 层）
                </MenuItem>
              ) : null}
              {canRebase ? (
                <MenuItem
                  disabled={rebaseDisabled}
                  onClick={() => setConfirmation("update-branch")}
                >
                  <RefreshCwIcon aria-hidden />
                  堆栈变基
                </MenuItem>
              ) : null}
              {mergeHasClosed || mergeLayers.some((layer) => layer.isDraft) ? (
                <p className="px-2 py-1 text-xs text-muted-foreground">
                  合并的每一层必须开放，随时可以审查。
                </p>
              ) : null}
            </>
          ) : null}
        </MenuPopup>
      </Menu>
      {canMerge && selectedLayer?.state === "open" ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex">
                <Button
                  variant="default"
                  size="xs"
                  disabled={mergeDisabled && !stale}
                  aria-disabled={mergeDisabled || undefined}
                  aria-description={stale ? (notice ?? undefined) : undefined}
                  onClick={mergeDisabled ? undefined : () => setConfirmation("merge")}
                >
                  <PullRequestGlyph.merged aria-hidden className="size-3.5" />
                  合并堆栈
                </Button>
              </span>
            }
          />
          <TooltipPopup>
            {stale
              ? notice
              : `将截至 #${reference.number} 的堆叠请求合并到 ${stack.base}（${mergeLayers.length} ${mergeLayers.length === 1 ? terminology.singular : terminology.plural}）`}
          </TooltipPopup>
        </Tooltip>
      ) : null}
      <Dialog
        open={confirmation !== null}
        onOpenChange={(value) => {
          if (!value) setConfirmation(null);
        }}
      >
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmation === "merge"
                ? `要合并 ${mergeLayers.length} ${mergeLayers.length === 1 ? terminology.singular : terminology.plural} 吗？`
                : `要变基 ${unmerged.length} ${unmerged.length === 1 ? terminology.singular : terminology.plural} 吗？`}
            </DialogTitle>
            <DialogDescription>
              {confirmation === "merge"
                ? `使用 ${mergeMethod} 将 #${reference.number} 及其下方尚未合并的层合并到 ${stack.base}。${hostLabel} 会先检查合并规则，合并后再对其余层变基。`
                : `将远程分支从下到上重新定位到${stack.base}。 这会重写分支历史，并可能重新启动检查。如果层失败，早期的更新会保留。`}
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
              {confirmationLayers.map((layer) => (
                <li
                  key={layer.number}
                  className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2"
                >
                  <PullRequestStackLayerContent layer={layer} compact />
                </li>
              ))}
            </ul>
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmation(null)}>
              取消
            </Button>
            <Button onClick={() => void run()}>
              {confirmation === "merge" ? "合并堆栈" : "堆栈变基"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
