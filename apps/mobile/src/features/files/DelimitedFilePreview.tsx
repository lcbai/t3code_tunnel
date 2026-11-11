/* oxlint-disable react/no-array-index-key -- Captured table cells have stable positions and may contain identical values. */
import { ScrollView, View } from "react-native";
import type { parseDelimitedPreview } from "@t3tools/shared/delimitedPreview";
import { AppText as Text } from "../../components/ui/AppText";
import { FilePreviewNotice } from "./FilePreviewFeedback";

export function DelimitedFilePreview(props: {
  readonly table: ReturnType<typeof parseDelimitedPreview>;
}) {
  return (
    <ScrollView className="flex-1">
      {props.table.truncated ? (
        <FilePreviewNotice>
          表格仅显示前 100 行和前 30 列，完整内容可在源代码中查看。
        </FilePreviewNotice>
      ) : null}
      <ScrollView horizontal>
        <View>
          {props.table.rows.map((row, rowIndex) => (
            <View key={rowIndex} className={rowIndex === 0 ? "flex-row bg-subtle" : "flex-row"}>
              {row.map((cell, columnIndex) => (
                <View key={columnIndex} className="w-48 border-r border-b border-border px-3 py-2">
                  <Text
                    selectable
                    className={
                      rowIndex === 0
                        ? "text-sm font-t3-semibold text-foreground"
                        : "text-sm text-foreground"
                    }
                  >
                    {cell}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </ScrollView>
  );
}
