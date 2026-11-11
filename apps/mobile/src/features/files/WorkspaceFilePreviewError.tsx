import type { EnvironmentId } from "@t3tools/contracts";
import { View } from "react-native";

import { EmptyState } from "../../components/ui/EmptyState";
import { environmentCatalog } from "../../connection/catalog";
import type { AssetUrlFailureReason } from "../../state/asset-url-state";
import { useAtomCommand } from "../../state/use-atom-command";
import { useEnvironmentPresentation } from "../../state/presentation";
import { EnvironmentConnectionNotice } from "../connection/EnvironmentConnectionNotice";

export function WorkspaceFilePreviewError(props: {
  readonly environmentId: EnvironmentId | null;
  readonly reason: AssetUrlFailureReason;
  readonly onRetry: () => void;
}) {
  const { environmentId, onRetry } = props;
  const environment = useEnvironmentPresentation(environmentId);
  const retryEnvironment = useAtomCommand(environmentCatalog.retryNow, "environment retry");
  const retryConnection = () => {
    if (environmentId !== null) void retryEnvironment(environmentId);
    onRetry();
  };

  if (props.reason === "disconnected") {
    return (
      <View className="flex-1 bg-sheet">
        <EnvironmentConnectionNotice
          environmentLabel={environment.presentation?.entry.target.label ?? "Environment"}
          connection={
            environment.presentation?.connection ?? {
              phase: "available",
              error: null,
              traceId: null,
            }
          }
          resourceName="preview"
          onRetry={retryConnection}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-sheet px-6">
      <EmptyState
        title="预览不可用"
        detail="此文件可能已丢失、格式不受支持，或在该环境中不可用。"
        actionLabel="Try again"
        onAction={props.onRetry}
      />
    </View>
  );
}
