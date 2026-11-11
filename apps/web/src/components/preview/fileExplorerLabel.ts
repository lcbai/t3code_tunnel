import type { ExecutionEnvironmentPlatformOs, FileManagerRevealKind } from "@t3tools/contracts";

export function revealInFileExplorerLabel(platform: string): string {
  const normalized = platform.toLowerCase();
  if (normalized.includes("mac")) return "在查找器中揭示";
  if (normalized.includes("win")) return "在文件浏览器中显示";
  return "在文件中显示";
}

export function revealInFileExplorerLabelForOs(os: ExecutionEnvironmentPlatformOs): string {
  if (os === "darwin") return "在查找器中揭示";
  if (os === "windows") return "在文件浏览器中显示";
  return "在文件中显示";
}

export function revealInFileExplorerLabelForKind(kind: FileManagerRevealKind): string {
  if (kind === "finder") return "在查找器中揭示";
  if (kind === "file-explorer") return "在文件浏览器中显示";
  return "在文件中显示";
}
