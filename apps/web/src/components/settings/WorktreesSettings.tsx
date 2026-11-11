import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";

import { AdvancedSettings } from "./AdvancedSettings";
import { BranchNamingSettings } from "./BranchNamingSettings";
import { WorktreeSubmodulesRow } from "./ProjectDefaultsSettings";
import { ScopedSwitch } from "./ScopedSwitch";
import { useSettingsScope } from "./SettingsScopeContext";
import {
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { WorktreeCleanupSection, WorktreesDirectoryRow } from "./StorageSettings";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";

function StartFromRemoteRow() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      serverScoped
      settingKeys={["newWorktreesStartFromOrigin"]}
      {...searchableSetting("start-from-origin")}
      description="使用基分支履带远程分支的最新承诺，即使其名称不同。否则在源头使用同名分支。如果缺少远程分支，则使用本地分支。"
      resetAction={
        settings.newWorktreesStartFromOrigin !==
        DEFAULT_UNIFIED_SETTINGS.newWorktreesStartFromOrigin ? (
          <SettingResetButton
            label="新工作树从远程开始"
            onClick={() =>
              updateSettings({
                newWorktreesStartFromOrigin: DEFAULT_UNIFIED_SETTINGS.newWorktreesStartFromOrigin,
              })
            }
          />
        ) : null
      }
      control={
        <ScopedSwitch
          settingKeys={["newWorktreesStartFromOrigin"]}
          checked={settings.newWorktreesStartFromOrigin}
          onCheckedChange={(checked) =>
            updateSettings({ newWorktreesStartFromOrigin: Boolean(checked) })
          }
          aria-label="默认从远程启动新工作树"
        />
      }
    />
  );
}

export function WorktreesSettingsPanel() {
  const { scope } = useSettingsScope();
  const isProjectScope = scope.kind === "project" || scope.kind === "checkout";

  return (
    <SettingsPageContainer>
      <SettingsSection id="worktree-creation" title="创建">
        {!isProjectScope && <WorktreesDirectoryRow />}
        <StartFromRemoteRow />
        <AdvancedSettings targetIds={[searchableSetting("worktree-submodules").id]}>
          <WorktreeSubmodulesRow />
        </AdvancedSettings>
      </SettingsSection>
      <SettingsSection id="worktree-branches" title="分支">
        <BranchNamingSettings />
      </SettingsSection>
      <WorktreeCleanupSection />
    </SettingsPageContainer>
  );
}
