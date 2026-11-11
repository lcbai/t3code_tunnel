import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import { AsyncResult } from "effect/reactivity";
import * as Dialog from "../../components/ui/Dialog";
import { useFocusEffect, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { useRef, useState } from "react";
import { View } from "react-native";
import type { PullRequestReviewPosition } from "@t3tools/contracts";
import { AppText as Text, AppTextInput as TextInput } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { uuidv4 } from "../../lib/uuid";
import { composerPullRequests } from "../../state/pull-requests";
import { useEnvironmentQuery } from "../../state/query";
import { PullRequestSheetContent } from "./PullRequestSheetContent";
import { usePullRequestReviewDraft } from "./usePullRequestReviewDraft";
import { reviewPositionLabel } from "./pullRequestDiffComments";
import { pullRequestTarget, type PullRequestParams } from "./usePullRequestDiff";
import { usePullRequestPermissions } from "./usePullRequestPermissions";
import { PullRequestCompletionSuggestions } from "./PullRequestCompletionSuggestions";
import { usePullRequestCompletions } from "./usePullRequestCompletions";

export type InlineCommentParams = PullRequestParams & {
  readonly draftId?: string;
  readonly path: string;
  readonly oldPath?: string;
  readonly position: PullRequestReviewPosition;
  readonly headSha: string;
  readonly code: string;
};
export function PullRequestInlineCommentScreen({ route }: StaticScreenProps<InlineCommentParams>) {
  const params = route.params;
  const navigation = useNavigation();
  const store = usePullRequestReviewDraft(params);
  const saved = store.draft.comments.find((draft) => draft.id === params.draftId);
  const [editedBody, setBody] = useState<string | null>(null);
  const body = editedBody ?? saved?.body ?? "";
  const detail = useEnvironmentQuery(composerPullRequests.detail(pullRequestTarget(params)));
  const { refresh: refreshDetail } = detail;
  const completions = usePullRequestCompletions({
    environmentId: params.environmentId,
    projectId: params.projectId,
    value: body,
    onChangeValue: setBody,
    support: detail.data?.capabilities ?? null,
  });
  useFocusEffect(refreshDetail);
  const permissions = usePullRequestPermissions(params, detail.data);
  const stale = detail.data && detail.data.headSha !== params.headSha;
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (
      pending.current ||
      !store.ready ||
      !body.trim() ||
      detail.isPending ||
      detail.error ||
      stale ||
      !permissions.canInlineComment
    )
      return;
    pending.current = true;
    setBusy(true);
    store.update((draft) => ({
      ...draft,
      comments: [
        ...draft.comments.filter((comment) => comment.id !== params.draftId),
        {
          id: params.draftId ?? uuidv4(),
          path: params.path,
          ...(params.oldPath ? { oldPath: params.oldPath } : {}),
          position: params.position,
          headSha: params.headSha,
          code: params.code,
          body,
        },
      ],
    }));
    // flush reports write failures through the draft store's error field.
    const result = await settlePromise(() => store.flush());
    pending.current = false;
    setBusy(false);
    if (AsyncResult.isSuccess(result)) navigation.goBack();
  };
  return (
    <PullRequestSheetContent
      busy={busy}
      title={saved ? "编辑审查评论" : "审查评论"}
      subtitle={`#${params.number} · ${reviewPositionLabel(params.position)}`}
      footer={
        <Button
          fullWidth
          tone="contrast"
          label={busy ? "正在保存…" : "保存草稿"}
          loading={busy}
          disabled={
            !store.ready ||
            !body.trim() ||
            detail.isPending ||
            detail.error !== null ||
            Boolean(stale) ||
            !permissions.canInlineComment
          }
          onPress={() => void save()}
        />
      }
    >
      <View className="gap-2 rounded-[20px] bg-grouped-card p-4">
        <Text className="font-mono text-xs text-foreground-muted">{params.path}</Text>
        <Text selectable className="font-mono text-xs">
          {params.code}
        </Text>
      </View>
      <PullRequestCompletionSuggestions completions={completions} />
      <TextInput
        multiline
        selection={completions.selection}
        onSelectionChange={completions.onSelectionChange}
        onBlur={completions.onBlur}
        editable={store.ready && !busy}
        autoFocus
        accessibilityLabel="行内审查评论"
        placeholder="填写对此行的反馈…"
        placeholderTextColorClassName="accent-foreground-muted"
        maxLength={65536}
        value={body}
        onChangeText={setBody}
        className="min-h-32 rounded-[20px] bg-grouped-card p-4 text-base text-foreground"
        style={{ textAlignVertical: "top" }}
      />
      <Text className="text-xs text-foreground-muted">提交审查前，已保存的评论仅你可见。</Text>
      {stale ? (
        <Text className="text-sm text-danger-foreground">
          分支已变更。请返回当前差异并重新选择对应行。
        </Text>
      ) : null}
      {store.error || detail.error ? (
        <Text className="text-sm text-danger-foreground">{store.error ?? detail.error}</Text>
      ) : null}
      {saved ? (
        <Button
          label="删除草稿"
          onPress={() =>
            Dialog.alert("删除此草稿？", "其他审查评论会保留。", [
              { text: "取消", style: "cancel" },
              {
                text: "删除",
                style: "destructive",
                onPress: () => {
                  store.update((draft) => ({
                    ...draft,
                    comments: draft.comments.filter((comment) => comment.id !== saved.id),
                  }));
                  navigation.goBack();
                },
              },
            ])
          }
        />
      ) : null}
    </PullRequestSheetContent>
  );
}
