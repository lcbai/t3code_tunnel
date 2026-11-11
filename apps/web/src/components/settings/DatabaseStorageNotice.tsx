import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  databaseReclaimMinutes,
  type DatabaseStorageStatus,
  type EnvironmentId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { type ReactNode, useState } from "react";

import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { environmentAtomList, environmentIdsKey } from "../../state/environmentAtomList";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { SettingsRow, SettingsSection } from "./settingsLayout";

const DismissedEnvironmentIds = Schema.Array(Schema.String);
const reclaimPermissionsAtom = environmentAtomList(
  "web-database-reclaim-permissions",
  serverEnvironment.reclaimDatabaseSpace.permissionAtom,
);

const formatGiB = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GiB`;

/** Offers to reclaim the space on every machine whose database still holds at least 1 GiB of freed pages. */
export function DatabaseStorageNotice({
  environments,
}: {
  environments: ReadonlyArray<{ readonly environmentId: EnvironmentId; readonly label: string }>;
}) {
  const environmentIds = environments.map((environment) => environment.environmentId);
  const recommendations = useAtomValue(
    serverEnvironment.databaseCompactionRecommendations(JSON.stringify(environmentIds)),
  );
  const permissions = useAtomValue(reclaimPermissionsAtom(environmentIdsKey(environmentIds)));
  const [dismissed, setDismissed] = useLocalStorage(
    "database-storage-notice-dismissed",
    [],
    DismissedEnvironmentIds,
  );
  const { copyToClipboard } = useCopyToClipboard({ target: "command" });
  const visible = recommendations
    .filter((recommendation) => !dismissed.includes(recommendation.environmentId))
    .map((recommendation) => ({
      ...recommendation,
      label:
        environments.find(
          (environment) => environment.environmentId === recommendation.environmentId,
        )?.label ?? recommendation.environmentId,
      reclaimable:
        recommendation.status.canReclaim === true &&
        permissions[environmentIds.indexOf(recommendation.environmentId)] === true,
    }));
  if (visible.length === 0) return null;
  return (
    <SettingsSection id="storage-database" title="数据库">
      <SettingsRow
        title="恢复已释放的数据库空间"
        description={`这些数据库仍然保留着历史清理释放出来的空间。${
          visible.every((recommendation) => recommendation.reclaimable)
            ? ""
            : " Run the command on each machine to reclaim it. It restarts the background service. Quit the desktop app first if it hosts the environment."
        }`}
      />
      {visible.map(({ environmentId, status, label, reclaimable }) => {
        const dismiss = (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setDismissed((current) => [...current, environmentId])}
          >
            开除
          </Button>
        );
        return reclaimable ? (
          <ReclaimRow
            key={environmentId}
            environmentId={environmentId}
            label={label}
            status={status}
            dismiss={dismiss}
          />
        ) : (
          <SettingsRow
            key={environmentId}
            title={`${label} 上的 ${formatGiB(status.reclaimableBytes)}`}
            description={<code className="select-text break-all">{status.compactCommand}</code>}
            control={
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => copyToClipboard(status.compactCommand, undefined)}
                >
                  复制命令
                </Button>
                {dismiss}
              </div>
            }
          />
        );
      })}
    </SettingsSection>
  );
}

function ReclaimRow({
  environmentId,
  label,
  status,
  dismiss,
}: {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly status: DatabaseStorageStatus;
  readonly dismiss: ReactNode;
}) {
  const reclaim = useAtomCommand(serverEnvironment.reclaimDatabaseSpace);
  const [confirming, setConfirming] = useState(false);
  const [requested, setRequested] = useState(false);
  // A failed repair reports back after the restart, which ends the wait.
  const restarting = requested && status.reclaimFailure === undefined;
  const minutes = databaseReclaimMinutes(status);
  const amount = formatGiB(status.reclaimableBytes);
  const start = async () => {
    setConfirming(false);
    setRequested(true);
    const result = await reclaim({ environmentId, input: {} });
    if (result._tag === "Success") {
      toastManager.add({
        type: "success",
        title: `Reclaiming ${amount} on ${label}`,
        description: `T3 Code 在那里重新启动，并返回大约${minutes} min。`,
      });
      return;
    }
    setRequested(false);
    if (isAtomCommandInterrupted(result)) return;
    const error = squashAtomCommandFailure(result);
    toastManager.add({
      type: "error",
      title: `Could not reclaim space on ${label}`,
      description: error instanceof Error ? error.message : "发生了错误。",
    });
  };
  return (
    <SettingsRow
      title={`${label} 上的 ${amount}`}
      description={
        status.reclaimFailure === undefined
          ? `恢复T3 Code 在那里。 大约为${minutes} min。`
          : `上次尝试失败 :${status.reclaimFailure}`
      }
      control={
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="outline"
            size="xs"
            disabled={restarting}
            onClick={() => setConfirming(true)}
          >
            {restarting ? "重新启动中…" : "追偿"}
          </Button>
          {dismiss}
          <AlertDialog open={confirming} onOpenChange={setConfirming}>
            <AlertDialogPopup>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  追偿 {amount} on {label}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  T3 Code 打开 {label} 停止，重建其数据库，然后重新开始。它将会离线大约 {minutes}{" "}
                  分钟后，运行中的代理机在重新启动时停止。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogClose render={<Button variant="outline" />}>取消</AlertDialogClose>
                <Button onClick={() => void start()}>重新启动和收回</Button>
              </AlertDialogFooter>
            </AlertDialogPopup>
          </AlertDialog>
        </div>
      }
    />
  );
}
