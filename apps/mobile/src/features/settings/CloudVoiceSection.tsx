import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import { cloudSpeechDisclosure } from "@t3tools/shared/speech";
import { setCloudSpeechKey } from "@t3tools/client-runtime/voice-input";
import {
  configuredSecretSources,
  secretRequestReference,
} from "@t3tools/client-runtime/secret-request";
import {
  AuthSettingsWriteScope,
  CLOUD_SPEECH_LABELS,
  CLOUD_SPEECH_PROVIDER_NAMES,
  CloudSpeechProvider,
  CloudSpeechApiKey,
  CloudSpeechModelId,
  isSecretReference,
  type CloudSpeechModel,
  type SecretProviderId,
  type SettingsSecretValue,
  type VoiceTranscriptionDestination,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import Constants from "expo-constants";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { Sheet } from "../../components/ui/Sheet";
import * as Dialog from "../../components/ui/Dialog";
import { ProviderIcon } from "../../components/ProviderIcon";
import { AppText as Text } from "../../components/ui/AppText";
import { ListActionRow } from "../../components/ui/ListActionRow";
import { ListChoiceRow } from "../../components/ui/ListChoiceRow";
import { Chip } from "../../components/ui/Chip";
import type { EnvironmentPresentation } from "../../state/environments";
import { useEnvironmentScope } from "../../state/session";
import {
  chooseVoiceDestination,
  pendingCloudVoiceChoice,
  cloudVoiceConnectionAtom,
  cloudVoiceKeysAtom,
  cloudVoiceModelsAtom,
  runSpeech,
} from "../voice-input/voiceDestination";
import { SettingsSection } from "./components/SettingsSection";

type CloudDestination = Extract<VoiceTranscriptionDestination, { kind: "cloud" }>;
type Props = { environment: EnvironmentPresentation; active: CloudDestination | null };
const isApiKey = Schema.is(CloudSpeechApiKey);
const isModelId = Schema.is(CloudSpeechModelId);
const MODEL_ROWS = 6;

export function CloudVoiceSection({ environment, active }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <SettingsSection title={`云端 · ${environment.label}`}>
      <ListActionRow
        label="云端提供方"
        description={
          active
            ? `正在使用 ${CLOUD_SPEECH_LABELS[active.provider]}`
            : "可选 · 使用你自己的 API 密钥"
        }
        onPress={() => setOpen(true)}
      />
      {open && (
        <CloudChoices environment={environment} active={active} onClose={() => setOpen(false)} />
      )}
    </SettingsSection>
  );
}

function ModelPicker({
  models,
  value,
  current,
  disabled,
  onChange,
}: {
  models: ReadonlyArray<CloudSpeechModel>;
  value: string;
  /** The grant's model, flagged when the catalog no longer lists it. */
  current: string | undefined;
  disabled: boolean;
  onChange: (model: CloudSpeechModelId) => void;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const needle = query.trim().toLowerCase();
  const selected = models.find((model) => model.id === value);
  const matches = models.filter((model) =>
    `${model.name} ${model.id}`.toLowerCase().includes(needle),
  );
  const shown = showAll ? matches : matches.slice(0, MODEL_ROWS);
  const delisted = current !== undefined && !models.some((model) => model.id === current);
  return (
    <>
      <TextInput
        accessibilityLabel="搜索 OpenRouter 模型"
        placeholder="搜索转录模型"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        value={query}
        onChangeText={setQuery}
        className="mx-4 rounded-lg bg-background px-3 py-2 text-foreground"
      />
      {delisted ? (
        <Text className="mx-4 text-sm text-destructive">
          OpenRouter 已下架 {current}。选择其他模型后才能使用语音输入。
        </Text>
      ) : null}
      {selected && !shown.some((model) => model.id === selected.id) ? (
        <ListChoiceRow
          label={selected.name}
          description={selected.id}
          selected
          disabled={disabled}
          onPress={() => {}}
        />
      ) : null}
      {shown.map((model, index) => (
        <ListChoiceRow
          key={model.id}
          label={model.name}
          description={model.id}
          selected={model.id === value}
          separated={index > 0}
          disabled={disabled}
          onPress={() => onChange(model.id)}
        />
      ))}
      {matches.length === 0 ? (
        <Text className="mx-4 text-sm text-foreground-muted">找不到匹配的转录模型。</Text>
      ) : matches.length > shown.length ? (
        <ListActionRow
          label={`显示全部 ${matches.length} 个模型`}
          onPress={() => setShowAll(true)}
        />
      ) : null}
    </>
  );
}

function CloudChoices({ environment, active, onClose }: Props & { onClose: () => void }) {
  const id = environment.environmentId;
  const connection = useAtomValue(cloudVoiceConnectionAtom(id));
  const keys = useAtomValue(cloudVoiceKeysAtom(id));
  const reload = useAtomRefresh(cloudVoiceKeysAtom(id));
  const canManage = useEnvironmentScope(id, AuthSettingsWriteScope);
  const [editing, setEditing] = useState<{
    provider: CloudSpeechProvider;
    enable: boolean;
  } | null>(null);
  const catalogAtom = cloudVoiceModelsAtom(editing?.provider === "openrouter" ? id : null);
  const models = useAtomValue(catalogAtom);
  const reloadModels = useAtomRefresh(catalogAtom);
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState("");
  const [sourceId, setSourceId] = useState<SecretProviderId | null>(null);
  const sources =
    Constants.expoConfig?.extra?.secretsFeatureEnabled === true &&
    environment.serverConfig?.secretReferences
      ? configuredSecretSources(environment.serverConfig.settings.secretProviders)
      : [];
  const source = sources.find((candidate) => candidate.id === sourceId);
  const credential =
    sourceId !== null
      ? source && secretRequestReference(source, draft)
      : isApiKey(draft.trim())
        ? draft.trim()
        : undefined;
  const [saving, setSaving] = useState(false);
  const activeModel = active?.provider === "openrouter" ? active.model : undefined;
  const enable = (commit: () => void) => {
    try {
      commit();
    } catch {
      Dialog.alert("无法启用云端语音输入", "检查设备存储后重新选择提供方。");
    }
  };
  const edit = (provider: CloudSpeechProvider, enable: boolean) => {
    const stored = environment.serverConfig?.settings.cloudSpeechCredentials?.[provider];
    const ref =
      isSecretReference(stored) && sources.some((candidate) => candidate.id === stored.provider)
        ? stored
        : null;
    setSourceId(ref?.provider ?? null);
    setDraft(ref?.reference ?? "");
    setModel(provider === "openrouter" ? (activeModel ?? "") : "");
    setEditing({ provider, enable });
  };
  const reset = () => {
    setDraft("");
    setModel("");
    setEditing(null);
  };
  const changeKey = async (
    provider: CloudSpeechProvider,
    value: SettingsSecretValue | null,
    chosen?: CloudSpeechModelId,
  ) => {
    if (!connection || !canManage || saving) return;
    const commit =
      value !== null && (editing?.enable || (chosen !== undefined && chosen !== activeModel))
        ? pendingCloudVoiceChoice(id, provider, chosen)
        : null;
    setSaving(true);
    try {
      await runSpeech(setCloudSpeechKey(connection, provider, value));
    } catch {
      setSaving(false);
      Dialog.alert("Could not update the API key", "请检查环境连接和设置权限。");
      return;
    }
    setSaving(false);
    if (commit) enable(commit);
    reload();
    onClose();
  };
  const catalog = AsyncResult.isSuccess(models) ? (models.value?.models ?? null) : null;
  const content =
    !AsyncResult.isSuccess(keys) || !keys.value || !connection ? (
      <ListActionRow
        label={
          !connection
            ? "环境未连接"
            : keys._tag === "Failure"
              ? "Could not load keys · Retry"
              : "正在检查 API 密钥…"
        }
        disabled={!connection || keys._tag !== "Failure"}
        onPress={reload}
      />
    ) : (
      CloudSpeechProvider.literals.map((provider) => {
        if (editing && provider !== editing.provider) return null;
        const label = CLOUD_SPEECH_LABELS[provider];
        const company = CLOUD_SPEECH_PROVIDER_NAMES[provider];
        const routed = provider === "openrouter";
        const disclosure = cloudSpeechDisclosure(provider, environment.label);
        const saved = keys.value![provider];
        const isActive = active?.provider === provider;
        const isEditing = editing?.provider === provider;
        const modelChosen =
          isModelId(model) && (catalog?.some((entry) => entry.id === model) ?? false);
        const modelChanged = model !== (activeModel ?? "");
        const original = environment.serverConfig?.settings.cloudSpeechCredentials?.[provider];
        const keyChanged =
          credential !== undefined &&
          !(
            isSecretReference(credential) &&
            isSecretReference(original) &&
            original.provider === credential.provider &&
            original.reference === credential.reference
          );
        const routedReady =
          modelChosen &&
          (draft.trim() ? credential !== undefined : Boolean(saved)) &&
          (!isActive || modelChanged || keyChanged);
        const saveRouted = () => {
          if (!routedReady || !isModelId(model)) return;
          const grantChanges = !isActive || modelChanged;
          if (credential !== undefined && keyChanged)
            return void changeKey(provider, credential, model);
          // Model-only changes never write to the environment.
          if (grantChanges) enable(() => chooseVoiceDestination(id, provider, model));
          onClose();
        };
        return (
          <View key={provider}>
            {!isEditing && (
              <ListChoiceRow
                label={label}
                leading={
                  <ProviderIcon
                    provider={
                      provider === "openai" ? "codex" : provider === "xai" ? "grok" : provider
                    }
                    size={20}
                  />
                }
                selected={isActive}
                disabled={saved === undefined || (!saved && !canManage) || saving}
                description={
                  saved === undefined
                    ? "更新环境以使用此提供方"
                    : isActive && routed
                      ? `${activeModel} · Tap to change model${canManage ? " or key" : ""}`
                      : isActive && saved && canManage
                        ? "轻点管理密钥"
                        : saved
                          ? routed
                            ? "API 密钥已保存 · 选择模型即可使用"
                            : "API 密钥已保存在此环境"
                          : canManage
                            ? "添加 API 密钥以使用此提供方"
                            : "请让环境管理员添加 API 密钥"
                }
                onPress={() => {
                  if (routed) return edit(provider, !isActive);
                  if (!saved) return edit(provider, true);
                  if (isActive) {
                    if (canManage) edit(provider, false);
                    return;
                  }
                  Dialog.confirm({
                    title: `使用 ${label} for dictation?`,
                    message: `${disclosure} Select This device to stop sharing.`,
                    confirmText: `使用 ${label}`,
                    onConfirm: () => enable(pendingCloudVoiceChoice(id, provider)),
                  });
                }}
              />
            )}
            {isEditing && routed && (
              <>
                <Text className="mx-4 text-sm text-foreground-muted">{disclosure}</Text>
                {catalog ? (
                  <ModelPicker
                    models={catalog}
                    value={model}
                    current={activeModel}
                    disabled={saving}
                    onChange={setModel}
                  />
                ) : (
                  <ListActionRow
                    label={
                      AsyncResult.isFailure(models) ? "无法加载模型 · 重试" : "正在加载转录模型…"
                    }
                    disabled={!AsyncResult.isFailure(models)}
                    onPress={reloadModels}
                  />
                )}
              </>
            )}
            {isEditing && (canManage || routed) && (
              <>
                {canManage && sources.length > 0 && (
                  <View className="mx-4 flex-row flex-wrap gap-2">
                    <Chip
                      label="值"
                      size="small"
                      selected={sourceId === null}
                      disabled={saving}
                      onPress={() => {
                        setDraft("");
                        setSourceId(null);
                      }}
                    />
                    {sources.map((candidate) => (
                      <Chip
                        key={candidate.id}
                        label={candidate.label}
                        size="small"
                        selected={sourceId === candidate.id}
                        disabled={saving}
                        onPress={() => {
                          setDraft("");
                          setSourceId(candidate.id);
                        }}
                      />
                    ))}
                  </View>
                )}
                {canManage && (
                  <TextInput
                    key={sourceId ?? "literal"}
                    accessibilityLabel={
                      sourceId ? `${label} API key reference` : `${label} API key`
                    }
                    placeholder={
                      source?.referencePlaceholder ??
                      (routed && saved ? "密钥已保存 · 输入新密钥可替换" : "API 密钥")
                    }
                    secureTextEntry={sourceId === null}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    importantForAutofill="no"
                    maxLength={4096}
                    editable={!saving}
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      if (routed) saveRouted();
                      else if (credential) void changeKey(provider, credential);
                    }}
                    value={draft}
                    onChangeText={setDraft}
                    className="mx-4 rounded-lg bg-background px-3 py-2 text-foreground"
                  />
                )}
                {routed && !saved && !canManage ? (
                  <ListActionRow
                    label="请让管理员添加 OpenRouter 密钥"
                    disabled
                    onPress={() => {}}
                  />
                ) : (
                  <ListActionRow
                    label={
                      routed
                        ? isActive
                          ? "保存"
                          : "保存并启用"
                        : editing.enable
                          ? "保存并启用"
                          : "保存密钥"
                    }
                    description={
                      draft && !credential
                        ? (source?.invalidReferenceMessage ?? "请输入有效的 API 密钥。")
                        : routed
                          ? saved && !credential
                            ? "使用保存在此环境上的 API 密钥。所选模型仅在当前设备上生效。"
                            : `Anyone with dictation access to ${environment.label} can bill this key.`
                          : editing.enable
                            ? `${disclosure} Anyone with dictation access to ${environment.label} can bill this key.`
                            : `Updates the ${company} key on ${environment.label}. Your dictation destination stays the same.`
                    }
                    disabled={(routed ? !routedReady : !credential) || saving}
                    onPress={() => {
                      if (routed) saveRouted();
                      else if (credential) void changeKey(provider, credential);
                    }}
                  />
                )}
                {saved && canManage && (
                  <ListActionRow
                    tone="danger"
                    label="从环境中移除密钥"
                    disabled={saving}
                    onPress={() =>
                      Dialog.confirm({
                        title: `Remove the ${label} key from ${environment.label}?`,
                        message: "使用此密钥进行语音输入的用户将失去访问权限。",
                        confirmText: "移除密钥",
                        destructive: true,
                        onConfirm: () => void changeKey(provider, null),
                      })
                    }
                  />
                )}
                <ListActionRow label="返回提供方" disabled={saving} onPress={reset} />
              </>
            )}
          </View>
        );
      })
    );
  return (
    <Sheet
      title={editing ? CLOUD_SPEECH_LABELS[editing.provider] : "云端提供方"}
      onClose={onClose}
      dismissDisabled={saving}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="gap-2 pb-8"
      >
        {content}
      </ScrollView>
    </Sheet>
  );
}
