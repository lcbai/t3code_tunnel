import { ScreenScrollView as ScrollView } from "../../components/ui/ScreenScrollView";
import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from "expo-audio";
import { useState } from "react";
import { Linking, Platform, useWindowDimensions, View } from "react-native";
import Reanimated, { ReduceMotion, useAnimatedStyle, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { type AppSymbolName } from "../../components/ui/AppSymbol";
import { AppText as Text } from "../../components/ui/AppText";
import { cn } from "../../lib/cn";
import { makePermissionStatusAtom } from "../../lib/permissionStatusAtom";
import {
  isMicrophoneDevice,
  type MicrophoneEntry,
  type MicrophoneKind,
  microphoneEntryKey,
} from "../../lib/microphonePriority";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { ListRowLayout } from "../../components/ui/ListRowLayout";
import { ListChoiceRow } from "../../components/ui/ListChoiceRow";
import * as Dialog from "../../components/ui/Dialog";
import { useEnvironments, type EnvironmentPresentation } from "../../state/environments";
import {
  chooseVoiceDestination,
  voiceConnectionAtom,
  voiceGrantAtom,
  voiceSpeechStatusAtom,
  hasEnvironmentVoiceCapture,
} from "../voice-input/voiceDestination";
import { VoiceModelSection } from "./VoiceModelSection";
import { CloudVoiceSection } from "./CloudVoiceSection";
import type { EnvironmentId } from "@t3tools/contracts";
import { ThreadSwipeable } from "../home/thread-swipe-actions";
import { ListActionRow as SettingsActionRow } from "../../components/ui/ListActionRow";
import { SettingsDragHandle } from "./components/SettingsDragHandle";
import { SettingsScreen } from "./components/SettingsScreen";
import { SettingsSection } from "./components/SettingsSection";
import {
  deviceMicrophoneOrder,
  localVoiceTranscriberAtom,
} from "../voice-input/VoiceInputProvider";

type MicrophonePermission = "checking" | "granted" | "ask" | "denied";

function toMicrophonePermission(response: {
  readonly granted: boolean;
  readonly canAskAgain: boolean;
}): MicrophonePermission {
  return response.granted ? "granted" : response.canAskAgain ? "ask" : "denied";
}

const readMicrophonePermission = () =>
  getRecordingPermissionsAsync().then(toMicrophonePermission, (): MicrophonePermission => "ask");

const microphonePermissionAtom = makePermissionStatusAtom<MicrophonePermission>({
  label: "mobile:microphone-permission",
  initial: "checking",
  read: readMicrophonePermission,
});

function useMicrophonePermission() {
  const permission = useAtomValue(microphonePermissionAtom);
  const setPermission = useAtomSet(microphonePermissionAtom);
  const request = () =>
    void requestRecordingPermissionsAsync()
      .then(toMicrophonePermission, readMicrophonePermission)
      .then(setPermission);
  return { permission, request };
}

const KINDS: Record<
  MicrophoneKind,
  {
    readonly label: string;
    readonly row: string;
    readonly rowDescription: string;
    readonly icon: AppSymbolName;
  }
> = {
  wired: {
    label: "有线",
    row: "其他有线设备",
    rowDescription: "未在此处列出的耳麦和 USB 麦克风",
    icon: "cable.connector",
  },
  bluetooth: {
    label: "蓝牙",
    row: "其他蓝牙设备",
    rowDescription:
      Platform.OS === "android"
        ? "Earbuds, headsets, and cars, including Android Auto, not listed here"
        : "AirPods, headsets, and cars not listed here",
    icon: "headphones",
  },
  builtIn: {
    label: "内置",
    row: "内置麦克风",
    rowDescription: "此设备上的麦克风",
    icon: "iphone",
  },
  carPlay: {
    label: "CarPlay",
    row: "CarPlay",
    rowDescription: "The car’s microphone",
    icon: "car",
  },
};

const UNAVAILABLE_EXPLANATION =
  Platform.OS === "android"
    ? "Dictation on this device needs Android 12 or later and Google speech services that support your language. Your keyboard’s voice typing is separate."
    : "Dictation on this device needs iOS 26 or later, a supported device, and a supported language. Your keyboard’s dictation is separate.";

function saveDestination(id: EnvironmentId | null) {
  try {
    chooseVoiceDestination(id);
  } catch {
    Dialog.alert(
      "无法保存转录选项",
      "本次已关闭环境语音输入。关闭应用前请再次保存，否则重启后可能恢复之前的选择。",
    );
  }
}

function EnvironmentChoice({
  environment,
  selected,
}: {
  environment: EnvironmentPresentation;
  selected: boolean;
}) {
  const usable = useAtomValue(voiceConnectionAtom(environment.environmentId)) !== null;
  const status = AsyncResult.getOrElse(
    useAtomValue(voiceSpeechStatusAtom(environment.environmentId)),
    () => null,
  );
  return (
    <ListChoiceRow
      label={environment.label}
      selected={selected}
      disabled={!usable}
      description={
        !usable
          ? environment.connection.phase !== "connected"
            ? "未连接"
            : "转录不可用"
          : status?.supported === false
            ? status.reason
            : status?.state === "missing-model"
              ? "尚未安装转录模型"
              : (environment.displayUrl ?? "将录制完成的音频发送到此环境。")
      }
      separated
      onPress={() => {
        if (!selected)
          Dialog.confirm({
            title: `Send microphone audio to ${environment.label}?`,
            message: `Finished recordings will be sent to ${environment.displayUrl ?? environment.label} for transcription. You can switch back to This device at any time.`,
            confirmText: "使用环境",
            onConfirm: () => saveDestination(environment.environmentId),
          });
      }}
    />
  );
}

export function SettingsVoiceRouteScreen() {
  const transcriber = useAtomValue(localVoiceTranscriberAtom);
  const grant = useAtomValue(voiceGrantAtom);
  const { environments, isReady } = useEnvironments();
  const grantEnvironment = grant
    ? environments.find(
        (environment) => environment.environmentId === grant.destination.environmentId,
      )
    : undefined;
  const insets = useSafeAreaInsets();
  const preferencesResult = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const ready = AsyncResult.isSuccess(preferencesResult) && !preferencesResult.waiting;
  const entries = deviceMicrophoneOrder(
    AsyncResult.isSuccess(preferencesResult) ? preferencesResult.value.microphones : undefined,
  );
  const { permission, request: requestPermission } = useMicrophonePermission();
  const [drag, setDrag] = useState<{ readonly key: string; readonly translation: number } | null>(
    null,
  );
  const [rowHeight, setRowHeight] = useState(0);
  // Each drop remounts the rows so the new order and the cleared offsets land in one frame.
  const [drops, setDrops] = useState(0);

  // Transforms apply to the stored order, so a device recorded meanwhile is kept.
  const move = (key: string, steps: number) =>
    savePreferences({
      transform: (current) => {
        const next = [...deviceMicrophoneOrder(current.microphones)];
        const from = next.findIndex((entry) => microphoneEntryKey(entry) === key);
        const to = Math.min(next.length - 1, Math.max(0, from + steps));
        if (from === -1 || from === to) return {};
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved!);
        return { microphones: next };
      },
    });
  const forget = (key: string) =>
    savePreferences({
      transform: (current) => ({
        microphones: deviceMicrophoneOrder(current.microphones).filter(
          (entry) => microphoneEntryKey(entry) !== key,
        ),
      }),
    });
  const dropSteps = (from: number, translation: number) =>
    rowHeight === 0
      ? 0
      : Math.min(entries.length - 1, Math.max(0, from + Math.round(translation / rowHeight))) -
        from;

  const dragFrom =
    drag === null ? -1 : entries.findIndex((entry) => microphoneEntryKey(entry) === drag.key);
  const dragTo = drag === null ? -1 : dragFrom + dropSteps(dragFrom, drag.translation);

  return (
    <SettingsScreen title="语音">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-3 px-5 pt-4"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
      >
        <SettingsSection title="转录位置">
          <ListChoiceRow
            label="此设备"
            description="音频保存在此设备，并在此设备上转录。"
            selected={!grant}
            onPress={() => saveDestination(null)}
          />
          {hasEnvironmentVoiceCapture &&
            environments.map((environment) => (
              <EnvironmentChoice
                key={environment.environmentId}
                environment={environment}
                selected={
                  grant?.destination.kind === "environment" &&
                  grant.destination.environmentId === environment.environmentId
                }
              />
            ))}
          {isReady && grant && !grantEnvironment ? (
            <ListChoiceRow
              label="先前选择的环境"
              description="已解除配对"
              separated
              selected
              disabled
              onPress={() => {}}
            />
          ) : null}
        </SettingsSection>
        {hasEnvironmentVoiceCapture &&
          environments
            .filter(
              (env) =>
                env.serverConfig?.environment.capabilities.cloudVoiceTranscription ||
                (grant?.destination.kind === "cloud" &&
                  grant.destination.environmentId === env.environmentId),
            )
            .map((environment) => (
              <CloudVoiceSection
                key={environment.environmentId}
                environment={environment}
                active={
                  grant?.destination.kind === "cloud" &&
                  grant.destination.environmentId === environment.environmentId
                    ? grant.destination
                    : null
                }
              />
            ))}
        {grantEnvironment && grant?.destination.kind === "environment" ? (
          <VoiceModelSection
            environmentId={grantEnvironment.environmentId}
            label={grantEnvironment.label}
          />
        ) : null}
        {!grant && transcriber === null ? (
          <Text className="px-2 text-sm text-foreground-muted">{UNAVAILABLE_EXPLANATION}</Text>
        ) : null}
        {permission === "ask" || permission === "denied" ? (
          <>
            <SettingsSection title="麦克风权限">
              <SettingsActionRow
                icon="mic"
                label={permission === "ask" ? "允许访问麦克风" : "打开设置"}
                onPress={
                  permission === "ask" ? requestPermission : () => void Linking.openSettings()
                }
              />
            </SettingsSection>
            <Text className="px-2 text-sm text-foreground-muted">
              {permission === "ask"
                ? "请允许访问麦克风，以便录音和查看可用设备。"
                : "请在系统设置中为 T3 Code 开启麦克风权限，以使用语音输入。"}
            </Text>
          </>
        ) : null}
        <SettingsSection title="首选顺序">
          {entries.map((entry, index) => {
            const key = microphoneEntryKey(entry);
            const shift =
              dragFrom === -1 || index === dragFrom
                ? 0
                : dragFrom < dragTo && index > dragFrom && index <= dragTo
                  ? -rowHeight
                  : dragFrom > dragTo && index < dragFrom && index >= dragTo
                    ? rowHeight
                    : 0;
            return (
              <MicrophoneRow
                key={`${key}:${drops}`}
                entry={entry}
                position={index + 1}
                count={entries.length}
                reorderable={ready}
                offset={index === dragFrom ? (drag?.translation ?? 0) : shift}
                lifted={index === dragFrom}
                onHeight={setRowHeight}
                onDragStart={() => setDrag({ key, translation: 0 })}
                onDragMove={(translation) => setDrag({ key, translation })}
                onDragEnd={(translation, cancelled) => {
                  setDrag(null);
                  setDrops((count) => count + 1);
                  if (!cancelled) move(key, dropSteps(index, translation));
                }}
                onStep={(direction) => move(key, direction === "up" ? -1 : 1)}
                onForget={isMicrophoneDevice(entry) ? () => forget(key) : undefined}
              />
            );
          })}
        </SettingsSection>
        <Text className="px-2 text-sm text-foreground-muted">
          语音输入使用列表中第一个已连接的麦克风。首次使用有线或蓝牙麦克风输入时，系统会按名称添加该设备；此前它归在「其他」中。向左滑动可移除已命名的麦克风。
          {Platform.OS === "android"
            ? "如果无法使用首选麦克风，Android 可能会改用其他麦克风。"
            : null}
        </Text>
      </ScrollView>
    </SettingsScreen>
  );
}

function MicrophoneRow(props: {
  readonly entry: MicrophoneEntry;
  readonly position: number;
  readonly count: number;
  readonly reorderable: boolean;
  readonly offset: number;
  readonly lifted: boolean;
  readonly onHeight: (height: number) => void;
  readonly onDragStart: () => void;
  readonly onDragMove: (translation: number) => void;
  readonly onDragEnd: (translation: number, cancelled: boolean) => void;
  readonly onStep: (direction: "up" | "down") => void;
  readonly onForget: (() => void) | undefined;
}) {
  const { lifted, offset, entry, onForget } = props;
  const kind = KINDS[entry.kind];
  const title = isMicrophoneDevice(entry) ? entry.name : kind.row;
  const { width: windowWidth } = useWindowDimensions();
  const style = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: lifted
          ? offset
          : withTiming(offset, { duration: 160, reduceMotion: ReduceMotion.System }),
      },
    ],
    zIndex: lifted ? 1 : 0,
  }));
  const row = (
    // Opaque so the swipe actions stay hidden until the row slides over them.
    <View className="flex-row items-center bg-grouped-card">
      <View
        accessible
        accessibilityLabel={`${title}, ${kind.label}, ${props.position} of ${props.count}`}
        accessibilityActions={onForget ? [{ name: "forget", label: "移除" }] : undefined}
        onAccessibilityAction={({ nativeEvent }) => {
          if (nativeEvent.actionName === "forget") onForget?.();
        }}
        className="min-w-0 flex-1"
      >
        <ListRowLayout
          icon={kind.icon}
          label={title}
          description={isMicrophoneDevice(entry) ? kind.label : kind.rowDescription}
        />
      </View>
      {props.reorderable ? (
        <SettingsDragHandle
          title={title}
          canMoveUp={props.position > 1}
          canMoveDown={props.position < props.count}
          onStart={props.onDragStart}
          onMove={props.onDragMove}
          onEnd={props.onDragEnd}
          onStep={props.onStep}
        />
      ) : null}
    </View>
  );
  return (
    <Reanimated.View
      style={style}
      onLayout={(event) => props.onHeight(event.nativeEvent.layout.height)}
      className={cn(
        props.position > 1 && !lifted && "border-t border-border-subtle",
        lifted && "bg-grouped-card shadow-md",
      )}
    >
      {onForget ? (
        <ThreadSwipeable
          backgroundColor="transparent"
          fullSwipeAction="primary"
          fullSwipeWidth={windowWidth - 40}
          onDelete={onForget}
          primaryAction={{
            accessibilityLabel: `移除 ${title}`,
            destructive: true,
            icon: "trash",
            label: "移除",
            onPress: onForget,
          }}
          secondaryAction={null}
          threadKey={`microphone:${microphoneEntryKey(entry)}`}
          threadTitle={title}
        >
          {() => row}
        </ThreadSwipeable>
      ) : (
        row
      )}
    </Reanimated.View>
  );
}
