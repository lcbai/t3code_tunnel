import type { AssetResource, ProjectReadFileError, ScopedThreadRef } from "@t3tools/contracts";
import { mediaFileReference } from "@t3tools/client-runtime/media-reference";
import { isHostPath, workspaceRelativeFilePath } from "@t3tools/shared/path";

export function resolveFilePreviewPath(path: string | null, cwd: string): string | null {
  if (path === null) return null;
  return path === "." || workspaceRelativeFilePath(path, cwd) === "." ? null : path;
}

export const isMarkdownPreviewFile = (path: string): boolean =>
  /\.(?:md|mdx|markdown|mdown|mkd)$/i.test(path);

export function filePreviewReadErrorMessage(error: ProjectReadFileError): string {
  switch (error.failure) {
    case "path_not_file":
      return "路径是目录或特殊文件，而不是普通文件。";
    case "binary_file":
      return "文件为二进制，不能显示为文本。";
    case "workspace_path_outside_root":
      return "请求的路径位于工作空间之外。";
    case "resolved_path_outside_root":
      return "路径解决到工作空间以外的位置。";
    case "operation_failed":
      return error.operation === "realpath-workspace-root"
        ? "无法访问工作空间文件夹。"
        : "文件无法访问或读取。它可能缺失或无法访问。";
    default:
      return error.message;
  }
}

export function shouldShowFileExplorer(input: {
  readonly relativePath: string | null;
  readonly explorerOpen: boolean;
  readonly attachmentOpen: boolean;
}): boolean {
  if (input.attachmentOpen || (input.relativePath && isHostPath(input.relativePath))) {
    return false;
  }
  return input.explorerOpen || input.relativePath === null;
}

/**
 * The server only signs `workspace-file` assets below the workspace root, so a
 * file opened from outside it, such as an absolute link in the thread, goes
 * through the host `media-file` resource the direct media viewer uses.
 */
export function workspaceAssetResource(input: {
  readonly kind: "workspace-file" | "media-file";
  readonly threadRef: ScopedThreadRef;
  readonly draft: boolean;
  readonly workspaceRoot: string;
  readonly absolutePath: string;
}): AssetResource {
  if (input.draft) {
    return { _tag: "draft-workspace-file", cwd: input.workspaceRoot, path: input.absolutePath };
  }
  const insideWorkspace =
    mediaFileReference(input.absolutePath, input.workspaceRoot).relativePath !== undefined;
  return {
    _tag: insideWorkspace ? input.kind : "media-file",
    threadId: input.threadRef.threadId,
    path: input.absolutePath,
  };
}
