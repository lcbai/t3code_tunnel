import { useAtom, useAtomValue } from "@effect/atom-react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";
import { View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import * as Dialog from "../../components/ui/Dialog";
import {
  describeOutdatedServer,
  serverEnvironment,
  updateOutdatedServer,
} from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { ListActionRow as SettingsActionRow } from "../../components/ui/ListActionRow";
import { SettingsSection } from "./components/SettingsSection";
import {
  environmentReleaseCheckAtom,
  releaseCheckError,
  releaseCheckValue,
} from "./environmentUpdateCheck";

export function OutdatedServerUpdateSection({
  environmentId,
  label,
}: {
  readonly environmentId: EnvironmentId;
  readonly label: string;
}) {
  const describe = useAtomCommand(describeOutdatedServer, { reportFailure: false });
  const update = useAtomCommand(updateOutdatedServer, { reportFailure: false });
  const state = useAtomValue(serverEnvironment.updateStateAtom(environmentId));
  const [checkResult, startCheck] = useAtom(environmentReleaseCheckAtom(environmentId));
  const release = releaseCheckValue(checkResult);
  const checking = checkResult.waiting;
  // Starting an update replaces a failed check's message with the update's own state.
  const [checkErrorDismissed, setCheckErrorDismissed] = useState(false);
  const error = checkErrorDismissed ? null : releaseCheckError(checkResult);
  const busy = checking || state.status === "running";

  function check() {
    if (busy) return;
    setCheckErrorDismissed(false);
    startCheck(async () => {
      const description = await describe(environmentId);
      if (AsyncResult.isFailure(description)) throw squashAtomCommandFailure(description);
      return description.value.serverVersion;
    });
  }

  function requestUpdate() {
    const targetVersion = release?.targetVersion;
    if (busy || !release || !targetVersion) return;
    Dialog.alert(
      `更新 ${label}?`,
      `Install T3 Code ${targetVersion}. T3 Code restarts on that machine and reconnects. Running threads may be interrupted.`,
      [
        { text: "取消", style: "cancel" },
        {
          text: "更新",
          onPress: () => {
            setCheckErrorDismissed(true);
            void update({
              environmentId,
              input: { targetVersion },
              fromVersion: release.fromVersion,
            });
          },
        },
      ],
    );
  }

  return (
    <SettingsSection title="T3 Code">
      <View className="gap-1 p-4">
        <Text className="text-base text-foreground">
          {release ? `版本 ${release.fromVersion}` : "需要更新"}
        </Text>
        <Text className="text-sm text-foreground-muted">
          {state.status === "running"
            ? state.stage === "resuming"
              ? "正在重启并重新连接…"
              : state.stage === "installing"
                ? "正在安装更新…"
                : "正在下载更新…"
            : release
              ? release.targetVersion
                ? `版本 ${release.targetVersion} 可用。`
                : "当前没有新版本。"
              : "此应用需要该设备上安装较新版本的 T3 Code。"}
        </Text>
        {error || state.status === "failed" ? (
          <Text selectable accessibilityRole="alert" className="text-sm text-danger-foreground">
            {error ?? (state.status === "failed" ? state.message : null)}
          </Text>
        ) : null}
      </View>
      <SettingsActionRow
        icon="arrow.clockwise"
        label="检查更新"
        disabled={busy}
        loading={checking}
        onPress={check}
      />
      {release?.targetVersion ? (
        <SettingsActionRow
          icon="arrow.up.circle"
          label={state.status === "failed" ? "重试更新" : `更新到 ${release.targetVersion}`}
          disabled={busy}
          loading={state.status === "running"}
          onPress={requestUpdate}
        />
      ) : null}
    </SettingsSection>
  );
}
