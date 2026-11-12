import * as Dialog from "../../components/ui/Dialog";
import { useAtomValue } from "@effect/atom-react";
import {
  AuthOrchestrationOperateScope,
  clampManagedRuntimeMode,
  managedCapabilityDenial,
  resolveProjectProviderInstanceEnabled,
} from "@t3tools/contracts";
import { readEnvironmentScope } from "../../state/session";
import type {
  EnvironmentId,
  ProjectId,
  ScheduledTask,
  ScheduledTaskThreadMode,
  ScheduledTaskUpsertInput,
} from "@t3tools/contracts";
import {
  MAX_WEBHOOK_DELIVERY_AGE_MINUTES,
  MAX_WEBHOOK_FILTERS,
  resolveEnvironmentMachineKind,
  scheduledTaskThreadMode,
} from "@t3tools/contracts";
import { useSelectWorkspaceDetail } from "../layout/workspace/useSelectWorkspaceDetail";
import type { MenuAction } from "@react-native-menu/menu";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { resolvePastedPath } from "@t3tools/shared/path";
import {
  DEFAULT_WEBHOOK_PROMPT,
  emptyWebhookFilterDraft,
  parseMaxDeliveryAge,
  parseWebhookFilterDrafts,
  removeWebhookFilterDraft,
  WEBHOOK_FILTER_OPS,
  type WebhookFilterDraft,
} from "@t3tools/client-runtime/scheduled-task-webhook";
import { useRef, useState, type ReactNode } from "react";
import { useFocusEffect, useNavigation, usePreventRemove } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { AppState, Platform, Pressable, TextInput as RNTextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "../../components/ui/Button";
import { AppText as Text } from "../../components/ui/AppText";
import { SymbolView } from "../../components/ui/AppSymbol";
import {
  EnvironmentMachineSymbol,
  ENVIRONMENT_MACHINE_SYMBOLS,
} from "../../components/EnvironmentMachineSymbol";
import { Menu } from "../../components/ui/Menu";
import type { ComposerEditorSelection } from "../../components/ComposerEditor";
import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { ThemedSwitch } from "../../components/ui/ThemedSwitch";
import { webhookAddress } from "@t3tools/client-runtime/webhook-address";
import { tryCopyTextWithHaptic } from "../../lib/copyTextWithHaptic";
import { usePreparedConnection } from "../../state/session";
import { buildModelOptions } from "../../lib/modelOptions";
import { useProjects, useEnvironmentServerConfig } from "../../state/entities";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { resolveNewTaskBranchLabel } from "../threads/new-task-context-presentation";
import { useVoiceInputController } from "../voice-input/useVoiceInputController";
import { ScheduledTaskPromptField } from "./components/ScheduledTaskPromptField";
import { useSettingsEnvironmentMenu } from "./components/SettingsEnvironmentFilterHeader";
import { SettingsScreen } from "./components/SettingsScreen";
import { SettingsSection } from "./components/SettingsSection";
import { useSettingsEnvironmentFilter, type SettingsTarget } from "./settings-environment-filter";
import {
  changeDraftProject,
  editDraft,
  parseIntervalMinutes,
  scheduledTaskDefaultModel,
  scheduleFromDraft,
  unbindDraftFromThread,
  type ScheduledTaskDraft as Draft,
} from "./scheduledTaskDraft";
import { settingsTargetsForProject } from "./settings-environment-filter.logic";
import {
  NEW_THREAD_DESTINATION_LABEL,
  useScheduledTaskDestinationLabel,
  useScheduledTaskEditor,
} from "./scheduled-task-editor";
import {
  discardScheduledTaskEditor,
  markScheduledTaskEditorSaved,
  scheduledTaskEditorSessionAtom,
} from "./scheduled-task-editor-state";
import { appAtomRegistry } from "../../state/atom-registry";
import {
  formatNextScheduledTaskRun,
  formatScheduledTaskInterval,
} from "./scheduledTaskPresentation";

type ScheduledTaskRoutes = {
  SettingsScheduledTaskNew: undefined;
  SettingsScheduledTaskEdit: undefined;
  SettingsScheduledTaskModel: undefined;
  SettingsScheduledTaskBranch: undefined;
  SettingsScheduledTaskThread: undefined;
};

const DAYS = [
  { index: 1, label: "周一" },
  { index: 2, label: "周二" },
  { index: 3, label: "周三" },
  { index: 4, label: "周四" },
  { index: 5, label: "周五" },
  { index: 6, label: "周六" },
  { index: 0, label: "周日" },
] as const;

const WEEKDAYS = [1, 2, 3, 4, 5] as const;

const THREAD_MODE_LABELS: Record<ScheduledTaskThreadMode, string> = {
  new_thread: NEW_THREAD_DESTINATION_LABEL,
  continue: "在同一会话中继续",
  fresh_session: "在同一会话中重新开始",
};

const WORKSPACE_LABELS: Record<Draft["workspace"], string> = {
  worktree: "新建工作树",
  root: "项目检出目录",
  existing_worktree: "指定检出目录",
};

function describeSchedule(task: ScheduledTask): string {
  if (task.schedule.type === "webhook") return "收到 Webhook 时";
  if (task.schedule.type === "once") {
    const runAt = new Date(task.schedule.runAt);
    return `运行一次，${formatRunAtDate(runAt)} ${formatRunAtTime(runAt)}`;
  }
  if (task.schedule.type === "interval") return formatScheduledTaskInterval(task.schedule.everyMs);
  const days = task.schedule.weekdays?.length ? repeatLabel(task.schedule.weekdays) : "每天";
  return `${days} ${formatTime(task.schedule.timeOfDay)}`;
}

function formatTime(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return value;
  const time = new Date();
  time.setHours(hours ?? 9, minutes ?? 0, 0, 0);
  return time.toLocaleTimeString("zh-CN", { hour: "numeric", minute: "2-digit" });
}

function formatRunAtDate(value: Date): string {
  return value.toLocaleDateString("zh-CN", { month: "short", day: "numeric", year: "numeric" });
}

function formatRunAtTime(value: Date): string {
  return value.toLocaleTimeString("zh-CN", { hour: "numeric", minute: "2-digit" });
}

function timePickerValue(value: string): Date {
  const [hours, minutes] = value.split(":").map(Number);
  const time = new Date();
  time.setHours(
    Number.isInteger(hours) ? (hours ?? 9) : 9,
    Number.isInteger(minutes) ? (minutes ?? 0) : 0,
    0,
    0,
  );
  return time;
}

function isWeekdaySchedule(days: ReadonlySet<number>): boolean {
  return days.size === WEEKDAYS.length && WEEKDAYS.every((day) => days.has(day));
}

function repeatLabel(weekdays: ReadonlyArray<number>): string {
  const days = new Set(weekdays);
  if (days.size === 7) return "每天";
  if (isWeekdaySchedule(days)) return "工作日";
  return (
    DAYS.filter((day) => days.has(day.index))
      .map((day) => day.label)
      .join("、") || "请选择日期"
  );
}

function FormField(props: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly keyboardType?: "decimal-pad" | "number-pad";
  readonly disabled?: boolean;
  readonly placeholder?: string;
  readonly borderTop?: boolean;
}) {
  return (
    <View
      className={
        props.borderTop ? "gap-2 border-t border-border-subtle px-4 py-3" : "gap-2 px-4 py-3"
      }
    >
      <Text className="text-sm text-foreground-muted">{props.label}</Text>
      <RNTextInput
        accessibilityLabel={props.label}
        value={props.value}
        readOnly={props.disabled}
        onChangeText={props.onChange}
        textAlignVertical="center"
        keyboardType={props.keyboardType}
        placeholder={props.placeholder}
        placeholderTextColorClassName="accent-foreground-muted"
        className="min-h-8 font-sans text-base text-foreground"
      />
    </View>
  );
}

function SelectRow(props: {
  readonly label: string;
  readonly value: string;
  readonly valueIcon?: ReactNode;
  readonly actions: MenuAction[];
  readonly onSelect: (id: string) => void;
  readonly borderTop?: boolean;
}) {
  const value = (
    <View className="min-w-0 flex-1 flex-row items-center justify-end gap-2">
      {props.valueIcon}
      <Text
        textRole="footnote"
        className="shrink text-right text-foreground-muted"
        numberOfLines={1}
      >
        {props.value}
      </Text>
    </View>
  );
  if (props.actions.length === 0) {
    return (
      <View
        className={
          props.borderTop
            ? "min-h-14 flex-row items-center gap-3 border-t border-border-subtle px-4 py-3"
            : "min-h-14 flex-row items-center gap-3 px-4 py-3"
        }
      >
        <Text textRole="body" className="text-foreground">
          {props.label}
        </Text>
        {value}
      </View>
    );
  }
  return (
    <Menu
      actions={props.actions}
      onPressAction={({ nativeEvent }) => props.onSelect(nativeEvent.event)}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${props.label}, ${props.value}`}
        className={
          props.borderTop
            ? "min-h-14 flex-row items-center gap-3 border-t border-border-subtle px-4 py-3 active:opacity-70"
            : "min-h-14 flex-row items-center gap-3 px-4 py-3 active:opacity-70"
        }
      >
        <Text textRole="body" className="text-foreground">
          {props.label}
        </Text>
        {value}
        <SymbolView
          name="chevron.down"
          size={14}
          tintColorClassName="accent-chevron"
          type="monochrome"
        />
      </Pressable>
    </Menu>
  );
}

function WebhookFilterRows(props: {
  readonly filters: ReadonlyArray<WebhookFilterDraft>;
  readonly disabled: boolean;
  readonly onChange: (filters: ReadonlyArray<WebhookFilterDraft>) => void;
}) {
  const update = (index: number, patch: Partial<WebhookFilterDraft>) =>
    props.onChange(
      props.filters.map((filter, at) => (at === index ? { ...filter, ...patch } : filter)),
    );
  return (
    <>
      {props.filters.map((filter, index) => (
        <View key={filter.id}>
          <View className="flex-row items-center gap-3 border-t border-border-subtle px-4 pt-3">
            <Text className="min-w-0 flex-1 text-sm text-foreground-muted">筛选 {index + 1}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`移除筛选条件 ${index + 1}`}
              disabled={props.disabled}
              hitSlop={8}
              onPress={() => props.onChange(removeWebhookFilterDraft(props.filters, filter.id))}
              className="active:opacity-70"
            >
              <SymbolView name="trash" size={16} tintColorClassName="accent-danger-foreground" />
            </Pressable>
          </View>
          <FormField
            label="路径"
            value={filter.path}
            placeholder="body.action"
            disabled={props.disabled}
            onChange={(path) => update(index, { path })}
          />
          <SelectRow
            label="匹配条件"
            value={WEBHOOK_FILTER_OPS.find((option) => option.op === filter.op)?.label ?? ""}
            actions={WEBHOOK_FILTER_OPS.map((option) => ({
              id: option.op,
              title: option.label,
              state: option.op === filter.op ? ("on" as const) : undefined,
            }))}
            onSelect={(id) => {
              const known = WEBHOOK_FILTER_OPS.find((option) => option.op === id);
              if (known) update(index, { op: known.op });
            }}
          />
          {filter.op === "exists" ? null : (
            <FormField
              label={filter.op === "in" ? "多个值以逗号分隔" : "值"}
              value={filter.value}
              placeholder={filter.op === "in" ? "opened, reopened" : "opened"}
              disabled={props.disabled}
              onChange={(value) => update(index, { value })}
            />
          )}
        </View>
      ))}
      {props.filters.length < MAX_WEBHOOK_FILTERS ? (
        <Pressable
          accessibilityRole="button"
          disabled={props.disabled}
          onPress={() => props.onChange([...props.filters, emptyWebhookFilterDraft()])}
          className="min-h-14 flex-row items-center gap-3 border-t border-border-subtle px-4 py-3 active:opacity-70"
        >
          <Text textRole="body" className="min-w-0 flex-1 text-foreground">
            添加筛选条件
          </Text>
          <SymbolView name="plus" size={16} tintColorClassName="accent-icon" />
        </Pressable>
      ) : null}
      {props.filters.length > 0 ? (
        <Text className="px-4 pb-3 text-sm text-foreground-muted">
          仅在所有条件都匹配时运行。其他请求将记为已筛选。使用逗号分隔「属于以下任一值」的选项，选项本身不能含有逗号。
        </Text>
      ) : null}
    </>
  );
}

function PickerRow(props: {
  readonly label: string;
  readonly value: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly borderTop?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${props.label}, ${props.value}`}
      accessibilityState={{ disabled: props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      className={
        props.borderTop
          ? "min-h-14 flex-row items-center gap-3 border-t border-border-subtle px-4 py-3 active:opacity-70 disabled:opacity-50"
          : "min-h-14 flex-row items-center gap-3 px-4 py-3 active:opacity-70 disabled:opacity-50"
      }
    >
      <Text textRole="body" className="text-foreground">
        {props.label}
      </Text>
      <Text
        textRole="footnote"
        className="min-w-0 flex-1 text-right text-foreground-muted"
        numberOfLines={1}
      >
        {props.value}
      </Text>
      <SymbolView
        name="chevron.right"
        size={14}
        tintColorClassName="accent-chevron"
        type="monochrome"
      />
    </Pressable>
  );
}

export function SettingsScheduledTasksRouteScreen() {
  const [now, setNow] = useState(Date.now);
  useFocusEffect(() => {
    const updateNow = () => setNow(Date.now());
    updateNow();
    const timer = setInterval(updateNow, 60_000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") updateNow();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  });
  const { availableTargets, selectedTargets, selectedProjectKey, projectGroups } =
    useSettingsEnvironmentFilter();
  const selectedGroup = projectGroups.find((group) => group.key === selectedProjectKey);
  const visibleEnvironments = settingsTargetsForProject(
    selectedTargets,
    selectedProjectKey === null ? null : selectedGroup,
  );
  const { startEditor, resetEditor } = useScheduledTaskEditor();
  const navigation = useNavigation<NativeStackNavigationProp<ScheduledTaskRoutes>>();
  const insets = useSafeAreaInsets();
  const environmentMenu = useSettingsEnvironmentMenu();
  const newTask = () => {
    if (visibleEnvironments.length === 0) return;
    resetEditor();
    navigation.navigate("SettingsScheduledTaskNew");
  };

  return (
    <SettingsScreen
      title="定时任务"
      actions={[
        {
          accessibilityLabel: "新建任务",
          icon: "plus",
          disabled: visibleEnvironments.length === 0,
          onPress: newTask,
        },
      ]}
      menus={[environmentMenu]}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-5 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        {visibleEnvironments.length > 0 ? (
          visibleEnvironments.map((environment) => (
            <EnvironmentTasks
              key={environment.environmentId}
              environment={environment}
              now={now}
              projectIds={
                selectedProjectKey === null
                  ? null
                  : (selectedGroup?.members
                      .filter(
                        (member) => member.project.environmentId === environment.environmentId,
                      )
                      .map((member) => member.project.id) ?? [])
              }
              onEdit={(task) => {
                startEditor({
                  environmentId: environment.environmentId,
                  environmentLabel: environment.label,
                  draft: editDraft(task),
                });
                navigation.navigate("SettingsScheduledTaskEdit");
              }}
            />
          ))
        ) : (
          <Text className="px-2 text-base text-foreground-muted">
            {availableTargets.length === 0
              ? "连接环境后即可查看和创建定时任务。"
              : "没有符合条件的环境。请调整上方筛选条件。"}
          </Text>
        )}
      </ScrollView>
    </SettingsScreen>
  );
}

// The "New task" action and takeScheduledTaskNewLink clear the editor before
// this screen opens, so it starts from the default target.
export function SettingsScheduledTaskNewRouteScreen() {
  return <SettingsScheduledTaskEditorScreen title="新建定时任务" />;
}

export function SettingsScheduledTaskEditRouteScreen() {
  return <SettingsScheduledTaskEditorScreen title="编辑定时任务" />;
}

function SettingsScheduledTaskEditorScreen({ title }: { readonly title: string }) {
  const { editor, voiceOwnerKey, readEditor, setEditor, hasChanges, draftForEnvironment } =
    useScheduledTaskEditor();
  const { availableTargets } = useSettingsEnvironmentFilter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  // Set once the save lands, so the removal guard lets the editor close.
  const saved = useRef(false);
  const ownerKey = editor ? `${voiceOwnerKey}:${editor.environmentId}` : null;
  const prompt = editor?.draft.prompt ?? "";
  const [selectionState, setSelectionState] = useState<{
    readonly ownerKey: string | null;
    readonly selection: ComposerEditorSelection;
  } | null>(null);
  const selection =
    selectionState?.ownerKey === ownerKey
      ? selectionState.selection
      : { start: prompt.length, end: prompt.length };
  const setSelection = (next: ComposerEditorSelection) =>
    setSelectionState({ ownerKey, selection: next });
  const setPrompt = (next: string) =>
    setEditor((current) =>
      current
        ? {
            ...current,
            draft: { ...current.draft, prompt: next },
          }
        : current,
    );
  const voiceInput = useVoiceInputController({
    ownerKey,
    label: editor?.draft.title.trim() || title,
    subscribeToDraftChanges: (onChange) =>
      appAtomRegistry.subscribe(scheduledTaskEditorSessionAtom, onChange),
    selection,
    readDraftMessage: () => {
      const current = readEditor();
      if (current?.environmentId !== editor?.environmentId) return null;
      return current?.draft.prompt ?? null;
    },
    onChangeSelection: setSelection,
    onChangeDraftMessage: (text) => {
      if (readEditor()?.environmentId === editor?.environmentId) setPrompt(text);
    },
    disabled: saving,
  });
  const preventRemove = hasChanges || saving;
  usePreventRemove(preventRemove, ({ data }) => {
    if (saved.current) {
      navigation.dispatch(data.action);
      return;
    }
    if (saving) {
      Dialog.alert("正在保存任务", "请等待任务保存完成后再离开。");
      return;
    }
    Dialog.alert("放弃变更？", "尚未保存的变更将丢失。", [
      { text: "继续编辑", style: "cancel" },
      {
        text: "放弃变更",
        style: "destructive",
        onPress: () => {
          if (voiceInput.isBusy) voiceInput.cancel();
          discardScheduledTaskEditor();
          navigation.dispatch(data.action);
        },
      },
    ]);
  });
  return (
    <SettingsScreen
      title={title}
      // Native Back pops before removal guards; a bar action lets the guard run first.
      guardBack={preventRemove}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-5 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        {editor ? (
          <TaskForm
            key={editor.environmentId}
            environmentId={editor.environmentId}
            environmentLabel={
              availableTargets.find((target) => target.environmentId === editor.environmentId)
                ?.label ?? editor.environmentLabel
            }
            availableTargets={availableTargets}
            draft={editor.draft}
            saving={saving}
            setSaving={setSaving}
            dictationPending={voiceInput.blocksSubmission}
            promptField={
              <ScheduledTaskPromptField
                value={prompt}
                onChange={setPrompt}
                selection={selection}
                onChangeSelection={setSelection}
                disabled={saving}
                voiceInput={voiceInput}
              />
            }
            setDraft={(draft) => {
              if (!saving) setEditor({ ...editor, draft });
            }}
            onSaved={() => {
              saved.current = true;
              markScheduledTaskEditorSaved();
              if (navigation.isFocused()) navigation.goBack();
            }}
            onChangeEnvironment={(target) => {
              if (target.environmentId === editor.environmentId) return;
              setEditor({
                environmentId: target.environmentId,
                environmentLabel: target.label,
                draft: {
                  ...draftForEnvironment(target.environmentId),
                  title: editor.draft.title,
                  prompt: editor.draft.prompt,
                  schedule: editor.draft.schedule,
                  enabled: editor.draft.enabled,
                },
              });
            }}
          />
        ) : (
          <Text className="px-2 text-base text-foreground-muted">
            {availableTargets.length === 0
              ? "连接环境后即可创建定时任务。"
              : "没有符合筛选条件的环境。请更改筛选条件后创建任务。"}
          </Text>
        )}
      </ScrollView>
    </SettingsScreen>
  );
}

function TaskForm({
  environmentId,
  environmentLabel,
  availableTargets,
  draft,
  saving,
  setSaving,
  dictationPending,
  promptField,
  setDraft,
  onSaved,
  onChangeEnvironment,
}: {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly availableTargets: readonly SettingsTarget[];
  readonly draft: Draft;
  readonly saving: boolean;
  readonly setSaving: (saving: boolean) => void;
  readonly dictationPending: boolean;
  readonly promptField: ReactNode;
  readonly setDraft: (draft: Draft) => void;
  readonly onSaved: () => void;
  readonly onChangeEnvironment: (target: SettingsTarget) => void;
}) {
  const navigation = useNavigation<NativeStackNavigationProp<ScheduledTaskRoutes>>();
  const tasks = useEnvironmentQuery(
    serverEnvironment.scheduledTasksLive({ environmentId, input: {} }),
  );
  // Pinned first. The chosen project stays listed after it is archived.
  const projects = useProjects()
    .filter(
      (project) =>
        project.environmentId === environmentId &&
        (project.archivedAt == null ||
          project.id === draft.projectId ||
          project.id === draft.task?.projectId),
    )
    .sort((left, right) => Number(right.pinnedAt != null) - Number(left.pinnedAt != null));
  const config = useEnvironmentServerConfig(environmentId);
  const destinationLabel = useScheduledTaskDestinationLabel(environmentId, draft.threadId);
  const modelOptions = buildModelOptions(config, null, undefined, draft.projectId);
  // Existing webhook tasks keep the option so they can still switch to a timer.
  const webhookDenial = managedCapabilityDenial(config?.managedPolicy, "webhookTasks");
  const canOperate = useAtomValue(
    serverEnvironment.upsertScheduledTask.permissionAtom(environmentId),
  );
  const upsert = useAtomCommand(serverEnvironment.upsertScheduledTask, {
    label: "scheduled task upsert",
    reportFailure: false,
  });
  const submissionPending = useRef(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [runAtPicker, setRunAtPicker] = useState<"date" | "time" | null>(null);
  const taskMissing =
    draft.task !== null &&
    tasks.data !== null &&
    !tasks.data.tasks.some((task) => task.id === draft.task?.id);
  const environmentUnavailable = !availableTargets.some(
    (target) => target.environmentId === environmentId,
  );

  const failure = (title: string, result: AtomCommandResult<unknown, unknown>) => {
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      Dialog.alert(title, String(squashAtomCommandFailure(result)));
    }
  };

  const offersOnce =
    config?.environment.capabilities.oneTimeSchedules === true ||
    draft.task?.schedule.type === "once";
  const offersThreadModes = config?.environment.capabilities.scheduledTaskThreadModes === true;
  const save = async () => {
    if (
      !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope) ||
      submissionPending.current ||
      saving ||
      dictationPending ||
      taskMissing ||
      environmentUnavailable
    )
      return;
    // Preserve signatures edited on other clients by sending the task's current value.
    const liveTask = tasks.data?.tasks.find((task) => task.id === draft.task?.id);
    const schedule = scheduleFromDraft(
      draft.schedule.mode === "webhook" && liveTask?.schedule.type === "webhook"
        ? { ...draft.schedule, signature: liveTask.schedule.signature }
        : draft.schedule,
    );
    if (
      draft.schedule.mode === "webhook" &&
      parseMaxDeliveryAge(draft.schedule.maxDeliveryAgeMinutes) === undefined
    ) {
      Dialog.alert(
        "时间限制无效",
        `Enter whole minutes from 1 to ${MAX_WEBHOOK_DELIVERY_AGE_MINUTES}, or leave it blank.`,
      );
      return;
    }
    if (draft.schedule.mode === "once" && !offersOnce) {
      Dialog.alert(
        "这里不支持单次运行",
        "此环境运行较早版本的 T3 Code。请更新后创建单次任务，或选择其他计划。",
      );
      return;
    }
    const parsedFilters = parseWebhookFilterDrafts(draft.schedule.filters);
    if (draft.schedule.mode === "webhook" && "error" in parsedFilters) {
      Dialog.alert("筛选条件无效", parsedFilters.error);
      return;
    }
    if (draft.schedule.mode === "webhook" && schedule === null) {
      Dialog.alert(
        "Webhook 设置无效",
        "每个去重键都必须含有有效的请求占位符。合并时间窗口须填写 10 至 3600 秒的整数，或留空。",
      );
      return;
    }
    if (
      !draft.title.trim() ||
      !draft.prompt.trim() ||
      !draft.projectId ||
      !draft.modelSelection ||
      !schedule ||
      (draft.workspace === "existing_worktree" && !draft.checkoutPath.trim())
    ) {
      Dialog.alert(
        "未完成的任务",
        "填写名称、提示词、项目、模型和有效的计划。需要时也请填写检出路径。",
      );
      return;
    }
    if (!projects.some((project) => project.id === draft.projectId)) {
      Dialog.alert("项目不可用", "请选择此环境中的项目。");
      return;
    }
    const input: ScheduledTaskUpsertInput = {
      ...(draft.task ? { id: draft.task.id, requireExisting: true } : {}),
      title: draft.title.trim(),
      prompt: draft.prompt.trim(),
      projectId: draft.projectId,
      modelSelection: draft.modelSelection,
      schedule,
      enabled: draft.enabled,
      threadId: draft.threadId,
      ...(offersThreadModes ? { threadMode: draft.threadMode } : {}),
      workspaceStrategy:
        draft.workspace === "root"
          ? { type: "root" }
          : draft.workspace === "existing_worktree"
            ? { type: "existing_worktree", worktreePath: draft.checkoutPath.trim() }
            : {
                type: "worktree",
                baseRef: draft.baseRef.trim() || "main",
                startFromOrigin: draft.startFromOrigin,
              },
      // Tasks have no mode picker; a mode above the administrator's ceiling is refused.
      runtimeMode:
        clampManagedRuntimeMode(config?.managedPolicy, draft.runtimeMode) ?? draft.runtimeMode,
      interactionMode: draft.task?.interactionMode ?? "default",
      creationSource: draft.task?.creationSource ?? "mobile",
    };
    submissionPending.current = true;
    setSaving(true);
    const result = await upsert({ environmentId, input });
    setSaving(false);
    if (result._tag === "Failure") {
      submissionPending.current = false;
      failure("Could not save task", result);
      return;
    }
    onSaved();
  };

  return (
    <View className="gap-5">
      <View
        className="gap-5"
        pointerEvents={saving ? "none" : "auto"}
        accessibilityElementsHidden={saving}
        importantForAccessibility={saving ? "no-hide-descendants" : "auto"}
      >
        {taskMissing ? (
          <Text className="px-1 text-base text-danger-foreground">此任务已不存在。</Text>
        ) : null}

        {environmentUnavailable ? (
          <Text className="px-1 text-base text-danger-foreground">
            此环境已断开。请重新连接后保存。
          </Text>
        ) : null}
        <SettingsSection>
          <SelectRow
            label="运行环境"
            value={environmentLabel}
            valueIcon={
              <EnvironmentMachineSymbol
                kind={resolveEnvironmentMachineKind(config)}
                size={18}
                tintColorClassName="accent-foreground-muted"
              />
            }
            actions={
              draft.task || saving || dictationPending
                ? []
                : availableTargets.map((target) => ({
                    id: target.environmentId,
                    title: target.label,
                    image:
                      ENVIRONMENT_MACHINE_SYMBOLS[
                        resolveEnvironmentMachineKind(target.serverConfig)
                      ],
                    state: target.environmentId === environmentId ? "on" : undefined,
                  }))
            }
            onSelect={(id) => {
              const target = availableTargets.find((entry) => entry.environmentId === id);
              if (target) onChangeEnvironment(target);
            }}
          />
        </SettingsSection>
        <SettingsSection title="任务">
          <FormField
            label="名称"
            disabled={saving}
            value={draft.title}
            placeholder="检查问题"
            onChange={(title) => setDraft({ ...draft, title })}
          />
          {promptField}
        </SettingsSection>

        <SettingsSection title="上下文">
          <SelectRow
            label="项目"
            value={
              projects.find((project) => project.id === draft.projectId)?.title ??
              (projects.length ? "请选择项目" : "没有可用的项目")
            }
            actions={projects.map((project) => ({
              id: project.id,
              title: project.title,
              state: project.id === draft.projectId ? "on" : undefined,
            }))}
            onSelect={(id) => {
              const project = projects.find((item) => item.id === id);
              if (!project) return;
              const keepsExplicitModel =
                draft.modelSelectionIsExplicit &&
                (draft.modelSelection === null ||
                  !config?.settings ||
                  resolveProjectProviderInstanceEnabled(
                    config.settings,
                    project.id,
                    draft.modelSelection.instanceId,
                  ));
              setDraft({
                ...changeDraftProject(draft, project.id),
                modelSelection: keepsExplicitModel
                  ? draft.modelSelection
                  : scheduledTaskDefaultModel(config, project),
                modelSelectionIsExplicit: keepsExplicitModel,
              });
            }}
          />
          <PickerRow
            label="模型"
            borderTop
            value={
              modelOptions.find(
                (option) =>
                  option.selection.instanceId === draft.modelSelection?.instanceId &&
                  option.selection.model === draft.modelSelection?.model,
              )?.label ??
              draft.modelSelection?.model ??
              (modelOptions.length ? "请选择模型" : "没有可用的模型")
            }
            onPress={() => navigation.navigate("SettingsScheduledTaskModel")}
            disabled={saving || dictationPending || environmentUnavailable}
          />
        </SettingsSection>

        <SettingsSection
          title="目标位置"
          footer={
            draft.threadMode === "new_thread"
              ? "每次运行都会新建会话。"
              : `${
                  draft.threadMode === "continue"
                    ? "每次运行都会继续当前会话。"
                    : "各次运行使用同一会话，每次都从空白上下文开始。"
                }${draft.threadId === null ? "首次运行时创建会话。" : ""}删除会话也会删除此任务。`
          }
        >
          {offersThreadModes ? (
            <SelectRow
              label="运行结果发送至"
              value={THREAD_MODE_LABELS[draft.threadMode]}
              actions={(Object.keys(THREAD_MODE_LABELS) as ScheduledTaskThreadMode[]).map(
                (mode) => ({
                  id: mode,
                  title: THREAD_MODE_LABELS[mode],
                  state: draft.threadMode === mode ? "on" : undefined,
                }),
              )}
              onSelect={(id) => {
                if (id === "new_thread")
                  setDraft({ ...unbindDraftFromThread(draft), threadMode: id });
                else if (id === "continue" || id === "fresh_session")
                  setDraft({ ...draft, threadMode: id });
              }}
            />
          ) : null}
          {!offersThreadModes || draft.threadMode !== "new_thread" ? (
            <PickerRow
              label="会话"
              borderTop={offersThreadModes}
              value={
                draft.threadId === null && draft.threadMode !== "new_thread"
                  ? "首次运行时创建"
                  : destinationLabel
              }
              onPress={() => navigation.navigate("SettingsScheduledTaskThread")}
              disabled={!draft.projectId || saving || dictationPending || environmentUnavailable}
            />
          ) : null}
        </SettingsSection>

        <SettingsSection title="工作区">
          <SelectRow
            label="运行位置"
            value={WORKSPACE_LABELS[draft.workspace]}
            actions={Object.entries(WORKSPACE_LABELS).map(([id, title]) => ({
              id,
              title,
              state: draft.workspace === id ? "on" : undefined,
            }))}
            onSelect={(id) => {
              if (id === "worktree" || id === "root" || id === "existing_worktree")
                setDraft({ ...draft, workspace: id });
            }}
          />
          {draft.workspace === "worktree" ? (
            <PickerRow
              label="基准分支"
              value={resolveNewTaskBranchLabel({
                branchName: draft.baseRef,
                startFromOrigin: draft.startFromOrigin,
                workspaceMode: "worktree",
              })}
              borderTop
              disabled={!draft.projectId || saving || dictationPending || environmentUnavailable}
              onPress={() => navigation.navigate("SettingsScheduledTaskBranch")}
            />
          ) : null}
          {draft.workspace === "existing_worktree" ? (
            <FormField
              label="检出路径"
              disabled={saving}
              value={draft.checkoutPath}
              borderTop
              onChange={(checkoutPath) =>
                setDraft({
                  ...draft,
                  checkoutPath: resolvePastedPath(draft.checkoutPath, checkoutPath),
                })
              }
            />
          ) : null}
        </SettingsSection>

        <SettingsSection title="定时计划">
          <View className="px-4 py-3">
            <SegmentedControl
              variant="card"
              options={[
                { value: "fixed_time", label: "指定时间" },
                // Older servers reject one-time schedules on save.
                ...(offersOnce || draft.schedule.mode === "once"
                  ? [{ value: "once" as const, label: "一次" }]
                  : []),
                { value: "interval", label: "间隔" },
                ...(webhookDenial === undefined || draft.schedule.mode === "webhook"
                  ? [{ value: "webhook" as const, label: "收到 Webhook 时" }]
                  : []),
              ]}
              selected={draft.schedule.mode}
              onSelect={(mode) => {
                setTimePickerOpen(false);
                setRunAtPicker(null);
                setDraft({
                  ...draft,
                  prompt:
                    mode === "webhook" && !draft.prompt.trim()
                      ? DEFAULT_WEBHOOK_PROMPT
                      : draft.prompt,
                  schedule: {
                    ...draft.schedule,
                    mode,
                    runAt:
                      mode === "once" && !draft.schedule.runAt
                        ? new Date(Math.ceil(Date.now() / 3_600_000) * 3_600_000).toISOString()
                        : draft.schedule.runAt,
                  },
                });
              }}
            />
          </View>
          {draft.schedule.mode === "fixed_time" ? (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`时间：${formatTime(draft.schedule.timeOfDay)}`}
                onPress={() => setTimePickerOpen((open) => !open)}
                className="min-h-14 flex-row items-center gap-3 border-t border-border-subtle px-4 py-3 active:opacity-70"
              >
                <Text textRole="body" className="text-foreground">
                  时间
                </Text>
                <Text
                  textRole="footnote"
                  className="min-w-0 flex-1 text-right text-foreground-muted"
                >
                  {formatTime(draft.schedule.timeOfDay)}
                </Text>
                <SymbolView
                  name="chevron.right"
                  size={14}
                  tintColorClassName="accent-chevron"
                  type="monochrome"
                />
              </Pressable>
              {timePickerOpen ? (
                <DateTimePicker
                  value={timePickerValue(draft.schedule.timeOfDay)}
                  mode="time"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  locale="zh_CN"
                  positiveButton={{ label: "确定" }}
                  negativeButton={{ label: "取消" }}
                  onDismiss={() => setTimePickerOpen(false)}
                  onValueChange={(_, selected) => {
                    const timeOfDay = `${String(selected.getHours()).padStart(2, "0")}:${String(selected.getMinutes()).padStart(2, "0")}`;
                    setDraft({ ...draft, schedule: { ...draft.schedule, timeOfDay } });
                  }}
                />
              ) : null}
              <SelectRow
                label="重复"
                value={repeatLabel(draft.schedule.weekdays)}
                borderTop
                actions={[
                  {
                    id: "every_day",
                    title: "每天",
                    state: draft.schedule.weekdays.length === 7 ? "on" : undefined,
                  },
                  {
                    id: "weekdays",
                    title: "工作日",
                    state: isWeekdaySchedule(new Set(draft.schedule.weekdays)) ? "on" : undefined,
                  },
                  ...DAYS.map((day) => ({
                    id: String(day.index),
                    title: day.label,
                    attributes: { keepsMenuPresented: true },
                    state: draft.schedule.weekdays.includes(day.index)
                      ? ("on" as const)
                      : undefined,
                  })),
                ]}
                onSelect={(id) => {
                  const weekdays =
                    id === "every_day"
                      ? DAYS.map((day) => day.index)
                      : id === "weekdays"
                        ? WEEKDAYS
                        : (() => {
                            const day = DAYS.find((item) => String(item.index) === id);
                            if (!day) return draft.schedule.weekdays;
                            return draft.schedule.weekdays.includes(day.index)
                              ? draft.schedule.weekdays.filter((index) => index !== day.index)
                              : [...draft.schedule.weekdays, day.index];
                          })();
                  setDraft({ ...draft, schedule: { ...draft.schedule, weekdays } });
                }}
              />
            </>
          ) : draft.schedule.mode === "webhook" && webhookDenial !== undefined && draft.enabled ? (
            <Text className="border-t border-border-subtle px-4 py-3 text-sm text-foreground-muted">
              {`${webhookDenial} Switch the task to a timer, or turn it off, to save it.`}
            </Text>
          ) : draft.schedule.mode === "once" ? (
            (["date", "time"] as const).map((field) => {
              const runAt = new Date(draft.schedule.runAt);
              const fieldLabel = field === "date" ? "日期" : "时间";
              const label = field === "date" ? formatRunAtDate(runAt) : formatRunAtTime(runAt);
              return (
                <View key={field}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${fieldLabel}：${label}`}
                    onPress={() => setRunAtPicker((open) => (open === field ? null : field))}
                    className="min-h-14 flex-row items-center gap-3 border-t border-border-subtle px-4 py-3 active:opacity-70"
                  >
                    <Text textRole="body" className="text-foreground">
                      {fieldLabel}
                    </Text>
                    <Text
                      textRole="footnote"
                      className="min-w-0 flex-1 text-right text-foreground-muted"
                    >
                      {label}
                    </Text>
                    <SymbolView
                      name="chevron.right"
                      size={14}
                      tintColorClassName="accent-chevron"
                      type="monochrome"
                    />
                  </Pressable>
                  {runAtPicker === field ? (
                    <DateTimePicker
                      value={runAt}
                      mode={field}
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      locale="zh_CN"
                      positiveButton={{ label: "确定" }}
                      negativeButton={{ label: "取消" }}
                      onDismiss={() => setRunAtPicker(null)}
                      onValueChange={(_, selected) => {
                        // Android shows a dialog that closes on pick; iOS stays inline.
                        if (Platform.OS === "android") setRunAtPicker(null);
                        setDraft({
                          ...draft,
                          schedule: { ...draft.schedule, runAt: selected.toISOString() },
                        });
                      }}
                    />
                  ) : null}
                </View>
              );
            })
          ) : draft.schedule.mode === "webhook" ? (
            <>
              <WebhookScheduleDetails
                environmentId={environmentId}
                // Use the live row for rotated URLs; hide the URL once a loaded list no longer contains the task.
                task={
                  tasks.data
                    ? (tasks.data.tasks.find((task) => task.id === draft.task?.id) ?? null)
                    : draft.task
                }
                signatureConfigured={draft.schedule.signature !== null}
                disabled={!canOperate || saving || environmentUnavailable}
              />
              <FormField
                label="跳过早于此时间的请求（分钟）"
                value={draft.schedule.maxDeliveryAgeMinutes}
                placeholder="运行每个请求"
                keyboardType="number-pad"
                disabled={saving}
                borderTop
                onChange={(maxDeliveryAgeMinutes) =>
                  setDraft({ ...draft, schedule: { ...draft.schedule, maxDeliveryAgeMinutes } })
                }
              />
              <WebhookFilterRows
                filters={draft.schedule.filters}
                disabled={saving}
                onChange={(filters) =>
                  setDraft({ ...draft, schedule: { ...draft.schedule, filters } })
                }
              />
              <FormField
                label="请求键重复"
                value={draft.schedule.replayKey}
                placeholder="{{headers.delivery-id}}"
                disabled={saving}
                borderTop
                onChange={(replayKey) =>
                  setDraft({ ...draft, schedule: { ...draft.schedule, replayKey } })
                }
              />
              <Text className="px-4 pb-3 text-sm text-foreground-muted">
                使用相同键的请求在 7 天内只运行一次。
              </Text>
              <FormField
                label="合并键模板"
                value={draft.schedule.coalesceKey}
                placeholder="{{body.id}}"
                disabled={saving}
                borderTop
                onChange={(coalesceKey) =>
                  setDraft({ ...draft, schedule: { ...draft.schedule, coalesceKey } })
                }
              />
              <FormField
                label="合并时间窗口（10–3600 秒）"
                value={draft.schedule.coalesceWindowSeconds}
                placeholder="120"
                keyboardType="number-pad"
                disabled={saving}
                borderTop
                onChange={(coalesceWindowSeconds) =>
                  setDraft({ ...draft, schedule: { ...draft.schedule, coalesceWindowSeconds } })
                }
              />
              <Text className="px-4 pb-3 text-sm text-foreground-muted">
                请求合并会在首次收到请求的时间窗口结束后执行最新的载荷。键为空时正常执行。
              </Text>
            </>
          ) : (
            <>
              <FormField
                label="运行间隔（分钟）"
                value={draft.schedule.intervalMinutes}
                keyboardType="decimal-pad"
                disabled={saving}
                borderTop
                onChange={(intervalMinutes) =>
                  setDraft({ ...draft, schedule: { ...draft.schedule, intervalMinutes } })
                }
              />
              {!(parseIntervalMinutes(draft.schedule.intervalMinutes) >= 1) ? (
                <Text className="px-4 pb-3 text-sm text-danger-foreground">
                  运行间隔至少为 1 分钟。请调整间隔后保存。
                </Text>
              ) : draft.task?.schedule.type === "interval" &&
                draft.task.schedule.everyMs < 60_000 ? (
                <Text className="px-4 pb-3 text-sm text-foreground-muted">
                  此任务原先每分钟运行多次。保存时请将间隔设为至少 1 分钟。
                </Text>
              ) : null}
            </>
          )}
          <View className="min-h-14 flex-row items-center gap-3 border-t border-border-subtle px-4 py-3">
            <Text textRole="body" className="min-w-0 flex-1 text-foreground">
              已启用
            </Text>
            <ThemedSwitch
              accessibilityLabel="任务已启用"
              value={draft.enabled}
              onValueChange={(enabled) => setDraft({ ...draft, enabled })}
            />
          </View>
        </SettingsSection>
        {draft.schedule.mode === "fixed_time" ? (
          <Text className="px-2 text-sm text-foreground-muted">
            时间采用环境的时区，可能与手机的时区不同。
          </Text>
        ) : null}
      </View>
      <Button
        tone="primary"
        fullWidth
        loading={saving}
        disabled={
          !canOperate ||
          dictationPending ||
          taskMissing ||
          environmentUnavailable ||
          // The server refuses an enabled webhook task under this policy.
          (draft.enabled && draft.schedule.mode === "webhook" && webhookDenial !== undefined)
        }
        onPress={() => void save()}
        label={saving ? "正在保存…" : draft.task ? "保存变更" : "创建任务"}
      />
    </View>
  );
}

function WebhookScheduleDetails({
  environmentId,
  task,
  signatureConfigured,
  disabled,
}: {
  readonly environmentId: EnvironmentId;
  readonly task: ScheduledTask | null;
  readonly signatureConfigured: boolean;
  readonly disabled: boolean;
}) {
  const [rotating, setRotating] = useState(false);
  const rotate = useAtomCommand(serverEnvironment.rotateScheduledTaskWebhookToken, {
    label: "scheduled task rotate webhook token",
    reportFailure: false,
  });
  const preparedConnection = usePreparedConnection(environmentId);
  const httpBaseUrl =
    preparedConnection._tag === "Some" ? preparedConnection.value.httpBaseUrl : null;
  const webhook = task?.schedule.type === "webhook" ? task.webhook : undefined;
  const resolved = webhook ? webhookAddress(webhook, httpBaseUrl) : null;
  return (
    <View className="gap-2 border-t border-border-subtle px-4 py-3">
      <Text className="text-sm text-foreground-muted">
        {
          "提示词可使用 {{body.a.b}}、{{headers.name}}、{{query.name}}、{{body}} 和 {{request}}。智能体仅能看到替换变量后的提示词。"
        }
      </Text>
      {task === null || resolved === null ? (
        <Text className="text-sm text-foreground-muted">保存任务后即可获取 Webhook 地址。</Text>
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="复制 Webhook 地址"
            accessibilityHint="将网址复制到剪贴板"
            disabled={!resolved.copyable}
            onPress={() => void tryCopyTextWithHaptic(resolved.address)}
            className="gap-1 active:opacity-70"
          >
            <Text textRole="body" className="text-foreground">
              {resolved.copyable ? "Webhook 地址" : "Webhook 路径"}
            </Text>
            <Text className="text-sm text-foreground-muted" numberOfLines={2} selectable>
              {resolved.address}
            </Text>
          </Pressable>
          {resolved.note !== null ? (
            <Text className="text-sm text-foreground-muted">{resolved.note}</Text>
          ) : null}
          <Button
            label={rotating ? "正在更换…" : "更换网址"}
            tone="danger"
            disabled={disabled || rotating}
            onPress={() =>
              Dialog.alert("更换网址？", "当前网址将立即失效。", [
                { text: "取消", style: "cancel" },
                {
                  text: "旋转",
                  style: "destructive",
                  onPress: () => {
                    setRotating(true);
                    void rotate({ environmentId, input: { id: task.id } }).then((result) => {
                      setRotating(false);
                      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
                        Dialog.alert(
                          "Could not rotate URL",
                          String(squashAtomCommandFailure(result)),
                        );
                      }
                    });
                  },
                },
              ])
            }
            loading={rotating}
          />
        </>
      )}
      {signatureConfigured ? (
        <Text className="text-sm text-foreground-muted">签名检查已在桌面端或网页版配置。</Text>
      ) : null}
    </View>
  );
}

function EnvironmentTasks({
  environment,
  now,
  projectIds,
  onEdit,
}: {
  readonly environment: SettingsTarget;
  readonly now: number;
  readonly projectIds: readonly ProjectId[] | null;
  readonly onEdit: (task: ScheduledTask) => void;
}) {
  const environmentId = environment.environmentId;
  const tasks = useEnvironmentQuery(
    serverEnvironment.scheduledTasksLive({ environmentId, input: {} }),
  );
  const visibleTasks = tasks.data?.tasks.filter(
    (task) => projectIds === null || projectIds.includes(task.projectId),
  );
  const canOperate = useAtomValue(
    serverEnvironment.upsertScheduledTask.permissionAtom(environmentId),
  );
  const setEnabled = useAtomCommand(serverEnvironment.setScheduledTaskEnabled, {
    label: "scheduled task enabled",
    reportFailure: false,
  });
  const runNow = useAtomCommand(serverEnvironment.runScheduledTaskNow, {
    label: "scheduled task run",
    reportFailure: false,
  });
  const remove = useAtomCommand(serverEnvironment.deleteScheduledTask, {
    label: "scheduled task delete",
    reportFailure: false,
  });
  const selectDetail = useSelectWorkspaceDetail();
  const failure = (title: string, result: AtomCommandResult<unknown, unknown>) => {
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      Dialog.alert(title, String(squashAtomCommandFailure(result)));
    }
  };

  const act = async (task: ScheduledTask, action: "run" | "toggle" | "delete") => {
    if (!readEnvironmentScope(environmentId, AuthOrchestrationOperateScope)) return;
    const result =
      action === "run"
        ? await runNow({ environmentId, input: { id: task.id } })
        : action === "toggle"
          ? await setEnabled({ environmentId, input: { id: task.id, enabled: !task.enabled } })
          : await remove({ environmentId, input: { id: task.id } });
    failure(`Could not ${action === "toggle" ? "update" : action} task`, result);
  };

  return (
    <SettingsSection
      title={environment.label}
      titleIcon={
        <EnvironmentMachineSymbol
          kind={resolveEnvironmentMachineKind(environment.serverConfig)}
          size={16}
          tintColorClassName={
            Platform.OS === "android" ? "accent-primary" : "accent-foreground-muted"
          }
        />
      }
    >
      {tasks.error ? (
        <Text className="p-4 text-base text-danger-foreground">{tasks.error}</Text>
      ) : !tasks.data ? (
        <Text className="p-4 text-base text-foreground-muted">正在加载任务…</Text>
      ) : visibleTasks?.length === 0 ? (
        <Text className="p-4 text-base text-foreground-muted">
          {projectIds === null ? "还没有定时任务。" : "此项目没有任务。"}
        </Text>
      ) : (
        visibleTasks?.map((task, index) => (
          <View
            key={task.id}
            className={
              index === 0
                ? "flex-row items-start gap-1 px-4 py-3"
                : "flex-row items-start gap-1 border-t border-border-subtle px-4 py-3"
            }
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`编辑 ${task.title}`}
              onPress={() => {
                onEdit(task);
              }}
              className="min-w-0 flex-1 gap-1 active:opacity-70"
            >
              <Text textRole="body" className="text-foreground" numberOfLines={1}>
                {task.title}
              </Text>
              <Text className="text-sm text-foreground-muted" numberOfLines={2}>
                {describeSchedule(task)}
                {!task.enabled
                  ? " · 已暂停"
                  : task.nextRunAt
                    ? ` · ${formatNextScheduledTaskRun(task.nextRunAt, now)}`
                    : ""}
              </Text>
              {task.blockedByPolicy ? (
                <Text className="text-sm text-foreground-muted" numberOfLines={2}>
                  {task.blockedByPolicy}
                </Text>
              ) : null}
              {task.lastRunError ? (
                <Text className="text-sm text-danger-foreground" numberOfLines={2}>
                  上次运行失败： {task.lastRunError}
                </Text>
              ) : null}
            </Pressable>
            <Menu
              actions={[
                { id: "edit", title: "编辑" },
                ...(task.threadId !== null && scheduledTaskThreadMode(task) !== "new_thread"
                  ? [{ id: "thread", title: "打开会话" }]
                  : []),
                {
                  id: "toggle",
                  title: task.enabled ? "暂停" : "恢复",
                  attributes: { disabled: !canOperate },
                },
                ...(task.schedule.type === "webhook"
                  ? []
                  : [{ id: "run", title: "立即运行", attributes: { disabled: !canOperate } }]),
                {
                  id: "delete",
                  title: "删除",
                  attributes: { destructive: true, disabled: !canOperate },
                },
              ]}
              onPressAction={({ nativeEvent }) => {
                const action = nativeEvent.event;
                if (action === "edit") {
                  onEdit(task);
                } else if (action === "thread" && task.threadId !== null) {
                  selectDetail({
                    name: "Thread",
                    params: {
                      environmentId: String(environmentId),
                      threadId: String(task.threadId),
                    },
                  });
                } else if (action === "delete") {
                  Dialog.alert("删除任务？", task.title, [
                    { text: "取消", style: "cancel" },
                    {
                      text: "删除",
                      style: "destructive",
                      onPress: () => void act(task, "delete"),
                    },
                  ]);
                } else if (action === "toggle" || action === "run") {
                  void act(task, action);
                }
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`操作：${task.title}`}
                className="h-11 w-11 items-center justify-center"
              >
                <SymbolView
                  name="ellipsis"
                  size={18}
                  tintColorClassName="accent-icon"
                  type="monochrome"
                />
              </Pressable>
            </Menu>
          </View>
        ))
      )}
    </SettingsSection>
  );
}
