import type {
  EnvironmentId,
  OrchestrationV2GetNativeChildWorkResult,
  OrchestrationV2NativeChildWork,
  ThreadId,
} from "@t3tools/contracts";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import { Sheet } from "../../components/ui/Sheet";
import { orchestrationEnvironment } from "../../state/orchestration";
import { useEnvironmentQuery } from "../../state/query";

const stepLabel = (type: string) => {
  const words = type.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** Read-only view of what a provider-native subagent's children did. Mount only while open. */
export function NativeChildWorkSheet(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const query = useEnvironmentQuery<OrchestrationV2GetNativeChildWorkResult, unknown>(
    orchestrationEnvironment.nativeChildWork({
      environmentId: props.environmentId,
      input: { threadId: props.threadId },
    }),
  );
  const children = query.data?.children;
  return (
    <Sheet title="子智能体工作" onClose={props.onClose}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          gap: 16,
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: Math.max(20, insets.bottom),
        }}
      >
        <Text className="font-sans text-xs text-foreground-secondary">
          只读模式。这些子智能体无法接收消息。
        </Text>
        {query.error !== null ? (
          <Text selectable className="font-sans text-sm text-danger-foreground">
            {query.error}
          </Text>
        ) : children === undefined ? (
          <Text className="font-sans text-sm text-foreground-secondary">正在加载…</Text>
        ) : children.length === 0 ? (
          <Text className="font-sans text-sm text-foreground-secondary">
            提供方未记录此次调用启动的子智能体。
          </Text>
        ) : (
          children.map((child) => <NativeChild key={child.conversationId} child={child} />)
        )}
        <View className="flex-row justify-end">
          <Button
            label="刷新"
            tone="secondary"
            disabled={query.isPending}
            onPress={query.refresh}
          />
        </View>
      </ScrollView>
    </Sheet>
  );
}

function NativeChild(props: { readonly child: OrchestrationV2NativeChildWork }) {
  const { child } = props;
  return (
    <View className="gap-2">
      <Text className="font-t3-bold text-sm text-foreground">{child.role || "子智能体"}</Text>
      <Text selectable className="font-sans text-sm text-foreground-secondary">
        {child.prompt}
      </Text>
      {child.truncated ? (
        <Text className="font-sans text-xs text-foreground-secondary">较早的步骤已隐藏。</Text>
      ) : null}
      {child.steps === null ? (
        <Text className="font-sans text-xs text-foreground-secondary">暂无转录文本。</Text>
      ) : (
        <View className="gap-2 border-l border-border ps-3">
          {child.steps.map((step) => (
            <View key={step.index} className="gap-1">
              <Text className="font-t3-bold text-xs text-foreground-secondary">
                {stepLabel(step.type)}
                {step.status !== null && step.status !== "DONE"
                  ? ` · ${stepLabel(step.status)}`
                  : ""}
              </Text>
              {step.toolCalls.length === 0 ? null : (
                <Text selectable className="font-mono text-xs text-foreground">
                  {step.toolCalls.map((call) => `${call.name} ${call.input}`).join("\n")}
                </Text>
              )}
              {step.text === null ? null : (
                <Text selectable className="font-mono text-xs text-foreground">
                  {step.text}
                </Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
