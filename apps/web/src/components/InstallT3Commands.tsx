import { cn } from "~/lib/utils";

import { CommandBlock } from "./CommandBlock";

/**
 * Setup steps for another computer: install `t3`, then run `command`. Both installers are shown
 * because the browser showing this is often not the computer being set up.
 */
export function InstallT3Commands({
  command,
  className,
}: {
  readonly command: string;
  readonly className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs text-muted-foreground">macOS、Linux</p>
      <CommandBlock command="curl -fsSL https://t3.codes/install.sh | sh" />
      <p className="text-xs text-muted-foreground">Windows（PowerShell）</p>
      <CommandBlock command="irm https://t3.codes/install.ps1 | iex" />
      <p className="text-xs text-muted-foreground">安装后运行</p>
      <CommandBlock command={command} />
      <p className="text-xs text-muted-foreground">
        如果已安装 <code className="font-mono">t3</code>，可以跳过安装。安装后找不到
        <code className="font-mono">t3</code> 时，请把安装程序提示的目录加入 PATH 后重试。
      </p>
    </div>
  );
}
