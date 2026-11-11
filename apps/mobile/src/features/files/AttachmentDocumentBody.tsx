import type { EnvironmentId } from "@t3tools/contracts";
import { View } from "react-native";

import { EmptyState } from "../../components/ui/EmptyState";
import type { useAttachmentDocument } from "../../lib/attachmentDocument";
import { HtmlRenderWebView } from "../threads/HtmlRenderWebView";
import { AudioFilePreview } from "./AudioFilePreview";
import { DelimitedFilePreview } from "./DelimitedFilePreview";
import { FileMarkdownPreview } from "./FileMarkdownPreview";
import { FilePreviewLoading, FilePreviewNotice } from "./FilePreviewFeedback";
import { SourceFileSurface } from "./SourceFileSurface";
import { WorkspaceFileWebPreview } from "./WorkspaceFileWebPreview";

export function nativeViewerKind(kind: ReturnType<typeof useAttachmentDocument>["kind"]) {
  if (kind === "image") return "image" as const;
  if (kind === "pdf") return "pdf" as const;
  if (kind === "video" || kind === "unsupported") return "document" as const;
  return null;
}

export function AttachmentDocumentBody(props: {
  readonly document: Pick<
    ReturnType<typeof useAttachmentDocument>,
    | "kind"
    | "activeMode"
    | "uri"
    | "content"
    | "table"
    | "error"
    | "needsText"
    | "retry"
    | "revision"
  >;
  readonly name: string;
  readonly environmentId: EnvironmentId | null;
  readonly htmlRender: boolean;
  readonly nativeViewer: "pending" | "open" | "unavailable" | null;
  readonly nativeError: string | null;
  readonly onOpenNative: () => void;
}) {
  const { document } = props;
  if (document.error) {
    return (
      <View className="flex-1 items-center justify-center bg-sheet px-6">
        <EmptyState
          title="文件不可用"
          detail={document.error}
          actionLabel="Try again"
          onAction={document.retry}
        />
      </View>
    );
  }
  if (props.nativeViewer !== null && props.nativeViewer !== "unavailable") {
    return <FilePreviewLoading message="正在文件查看器中打开…" />;
  }
  // ZIP text entries are read into memory and have no file URI.
  if (document.needsText ? !document.content : !document.uri) {
    return <FilePreviewLoading message="正在加载文件…" />;
  }
  if (document.needsText && document.content) {
    const { content, table } = document;
    return (
      <View className="flex-1 bg-sheet">
        {content.truncated ? (
          <FilePreviewNotice title="部分文件">
            预览仅显示前 1 MB。保存或分享文件后可查看完整内容。
          </FilePreviewNotice>
        ) : null}
        {table && document.activeMode === "table" ? (
          <DelimitedFilePreview table={table} />
        ) : document.activeMode === "markdown" && props.environmentId ? (
          <FileMarkdownPreview
            cwd=""
            relativePath=""
            environmentId={props.environmentId}
            threadId={null}
            markdown={content.text}
            captured
          />
        ) : (
          <SourceFileSurface contents={content.text} path={props.name} selectable />
        )}
      </View>
    );
  }
  if (!document.uri) return null;
  if (document.kind === "audio") {
    return <AudioFilePreview key={document.revision} uri={document.uri} onRetry={document.retry} />;
  }
  if (document.kind === "html") {
    return props.htmlRender ? (
      <HtmlRenderWebView key={document.uri} uri={document.uri} title={props.name} nested={false} />
    ) : (
      <WorkspaceFileWebPreview uri={document.uri} />
    );
  }
  return (
    <View className="flex-1 items-center justify-center bg-sheet px-6">
      <EmptyState
        title="此文件无法预览"
        detail={
          props.nativeError ??
          "此设备没有可显示此格式的应用。请保存或分享文件，然后在其他应用中打开。"
        }
        actionLabel="Try again"
        onAction={props.onOpenNative}
      />
    </View>
  );
}
