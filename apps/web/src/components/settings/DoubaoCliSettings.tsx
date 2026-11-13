import { useAtomValue } from "@effect/atom-react";
import { AuthTerminalOperateScope, type EnvironmentId } from "@t3tools/contracts";
import { DOUBAO_CLI_PROJECT_SCRIPT } from "@t3tools/shared/projectScripts";
import { useState } from "react";

import { serverEnvironment } from "../../state/server";
import { readEnvironmentScope, useEnvironmentScope } from "../../state/session";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import doubaoLogo from "./provider-logos/doubao.png";
import { ProviderSetupTerminal } from "./ProviderSetupTerminal";
import { SettingsRow, SettingsSection } from "./settingsLayout";

export function DoubaoCliSettings({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const canOperate = useEnvironmentScope(environmentId, AuthTerminalOperateScope);
  const [terminal, setTerminal] = useState<"login" | "cli" | null>(null);
  const launch = (nextTerminal: "login" | "cli") => {
    if (config !== null && readEnvironmentScope(environmentId, AuthTerminalOperateScope)) {
      setTerminal(nextTerminal);
    }
  };
  const closeLogin = () => setTerminal((current) => (current === "login" ? null : current));

  return (
    <Dialog
      open={terminal === "login" && config !== null}
      onOpenChange={(open) => (open ? launch("login") : closeLogin())}
    >
      <SettingsSection title="豆包" icon={<img src={doubaoLogo} alt="" className="size-4" />}>
        <SettingsRow
          title="豆包账号"
          description="用豆包 App 扫码登录。要让豆包在项目目录中运行，请从该项目的会话详情打开豆包 CLI。"
          control={
            <div className="flex flex-wrap gap-2">
              <DialogTrigger render={<Button size="sm" />} disabled={!canOperate || !config}>
                扫码登录
              </DialogTrigger>
              <Button
                size="sm"
                variant="outline"
                disabled={!canOperate || !config}
                onClick={() => launch("cli")}
              >
                打开豆包 CLI
              </Button>
            </div>
          }
        />
        {terminal === "cli" && config ? (
          <div className="px-3 pb-3 sm:px-4">
            <ProviderSetupTerminal
              environmentId={environmentId}
              cwd={config.cwd}
              keybindings={config.keybindings}
              terminalLabel="豆包 CLI"
              command={DOUBAO_CLI_PROJECT_SCRIPT.command}
              runImmediately
              onClose={() => setTerminal((current) => (current === "cli" ? null : current))}
            />
          </div>
        ) : null}
        <SettingsRow
          title="安装豆包 CLI"
          description={
            <span>
              在运行 T3 Code 的设备上执行 <code>npm install -g @bytedance/doubao-cli</code>。
            </span>
          }
        />
      </SettingsSection>
      {terminal === "login" && config ? (
        <DialogPopup className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>豆包扫码登录</DialogTitle>
            <DialogDescription>请用豆包 App 扫描下方二维码。</DialogDescription>
          </DialogHeader>
          <DialogPanel scrollFade={false}>
            <ProviderSetupTerminal
              environmentId={environmentId}
              cwd={config.cwd}
              keybindings={config.keybindings}
              terminalLabel="豆包登录"
              command="doubao login --qr=small"
              layout="dialog"
              runImmediately
              onClose={closeLogin}
            />
          </DialogPanel>
        </DialogPopup>
      ) : null}
    </Dialog>
  );
}
