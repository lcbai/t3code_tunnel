import { useAtomValue } from "@effect/atom-react";
import { AuthTerminalOperateScope, type EnvironmentId } from "@t3tools/contracts";
import { DOUBAO_CLI_PROJECT_SCRIPT } from "@t3tools/shared/projectScripts";
import { useState } from "react";

import { serverEnvironment } from "../../state/server";
import { readEnvironmentScope, useEnvironmentScope } from "../../state/session";
import { Button } from "../ui/button";
import doubaoLogo from "./provider-logos/doubao.png";
import { ProviderSetupTerminal } from "./ProviderSetupTerminal";
import { SettingsRow, SettingsSection } from "./settingsLayout";

export function DoubaoCliSettings({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const canOperate = useEnvironmentScope(environmentId, AuthTerminalOperateScope);
  const [command, setCommand] = useState<string | null>(null);
  const launch = (nextCommand: string) => {
    if (config !== null && readEnvironmentScope(environmentId, AuthTerminalOperateScope)) {
      setCommand(nextCommand);
    }
  };

  return (
    <SettingsSection title="豆包" icon={<img src={doubaoLogo} alt="" className="size-4" />}>
      <SettingsRow
        title="豆包账号"
        description="用豆包 App 扫码登录。要让豆包在项目目录中运行，请从该项目的会话详情打开豆包 CLI。"
        control={
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!canOperate || !config}
              onClick={() => launch("doubao login")}
            >
              扫码登录
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!canOperate || !config}
              onClick={() => launch(DOUBAO_CLI_PROJECT_SCRIPT.command)}
            >
              打开豆包 CLI
            </Button>
          </div>
        }
      />
      {command && config ? (
        <div className="px-3 pb-3 sm:px-4">
          <ProviderSetupTerminal
            key={command}
            environmentId={environmentId}
            cwd={config.cwd}
            keybindings={config.keybindings}
            terminalLabel="豆包 CLI"
            command={command}
            runImmediately
            onClose={() => setCommand(null)}
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
  );
}
