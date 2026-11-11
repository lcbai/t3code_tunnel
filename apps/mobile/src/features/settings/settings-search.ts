import { foldSearchQuery, rankSearchItems, scoreSearchTerms } from "@t3tools/shared/paletteSearch";

import type { SettingsPageTarget } from "./components/settings-page-targets";

/** What each page holds besides its row's label, so search finds a setting by its own name. */
const SETTINGS_SEARCH_TERMS = {
  SettingsEnvironments: [
    "服务器",
    "配对",
    "连接",
    "添加环境",
    "远程",
    "局域网",
    "servers",
    "connections",
    "pair",
    "add environment",
    "remote",
    "tailscale",
  ],
  SettingsAppearance: [
    "主题",
    "深色",
    "浅色",
    "颜色",
    "字号",
    "差异",
    "终端",
    "自动换行",
    "数学公式",
    "工具调用",
    "theme",
    "dark mode",
    "light mode",
    "colors",
    "font size",
    "text size",
    "code",
    "diffs",
    "terminal",
    "word break",
    "math",
    "tool calls in chat",
    "hide tool calls",
    "commands edits searches",
    "work log",
    "zen",
    "final answers only",
  ],
  SettingsNavigation: ["标签页", "排序", "隐藏标签页", "tabs", "tab order", "reorder", "hide tabs"],
  SettingsKeyboard: [
    "回车键",
    "发送消息",
    "换行",
    "实体键盘",
    "return key",
    "send message",
    "new line",
    "hardware keyboard",
  ],
  SettingsVoice: [
    "麦克风",
    "语音输入",
    "转录",
    "转录模型",
    "此设备",
    "蓝牙",
    "microphone",
    "dictation",
    "transcription",
    "transcribe on",
    "transcription model",
    "this device",
    "environment",
    "on-device",
    "audio input",
    "preferred microphone",
    "microphone order",
    "bluetooth",
  ],
  SettingsScheduledTasks: [
    "自动化",
    "定时任务",
    "定时计划",
    "重复",
    "Webhook",
    "automations",
    "schedule",
    "cron",
    "recurring",
    "webhook",
  ],
  SettingsProjectOverview: [
    "项目",
    "概览",
    "检出目录",
    "删除项目",
    "project",
    "overview",
    "checkouts",
    "delete project",
  ],
  SettingsOrganization: [
    "项目分组",
    "会话",
    "侧栏",
    "工作中",
    "上次的项目",
    "project grouping",
    "group projects",
    "organization",
    "sidebar",
    "working section",
    "new threads",
    "last project",
  ],
  SettingsThreads: [
    "新建会话",
    "默认工作区",
    "默认权限",
    "流式回复",
    "浏览器",
    "自动收尾",
    "用量限制",
    "自动恢复",
    "new threads",
    "default workspace",
    "default permissions",
    "access",
    "response streaming",
    "preview browser",
    "browser access",
    "auto-settle",
    "settle",
    "snooze",
    "usage limits",
    "auto-resume",
    "thread behavior",
  ],
  SettingsFollowUp: [
    "后续消息",
    "队列",
    "引导",
    "智能体运行期间",
    "follow-ups",
    "queue",
    "steer",
    "while the agent is running",
  ],
  SettingsArchive: ["归档", "取消归档", "恢复", "archive", "archived", "restore", "unarchive"],
  SettingsProviderAccounts: [
    "提供方账号",
    "登录",
    "认证",
    "provider accounts",
    "codex",
    "claude",
    "cursor",
    "opencode",
    "sign in",
    "login",
    "auth",
  ],
  SettingsEnvironmentSourceControl: [
    "拉取请求",
    "智能体署名",
    "默认分支",
    "自动拉取",
    "克隆",
    "git",
    "pull requests",
    "co-authors",
    "agent credits",
    "default branch",
    "automatically pull",
    "clone into host folders",
    "ghq",
  ],
  SettingsWorktrees: [
    "工作树",
    "分支命名",
    "分支前缀",
    "子模块",
    "远端",
    "worktree",
    "branch naming",
    "branch prefix",
    "submodules",
    "start from remote",
  ],
  SettingsLabs: [
    "实验室",
    "关联环境",
    "快速检出工作树",
    "缓存",
    "beta",
    "linked environments",
    "link machine",
    "fast worktree checkout",
    "clone cache",
  ],
  SettingsEnvironmentMaintenance: [
    "更新",
    "提供方更新",
    "重启",
    "管理环境",
    "updates",
    "provider updates",
    "restart",
    "manage environments",
  ],
  SettingsAbout: [
    "版本",
    "诊断",
    "客户端存储",
    "缓存",
    "法律信息",
    "隐私",
    "条款",
    "开源许可证",
    "version",
    "diagnostics",
    "client storage",
    "cache",
    "legal",
    "privacy",
    "terms",
    "open source licenses",
  ],
} satisfies Partial<Record<SettingsPageTarget, readonly string[]>>;
const termsById: ReadonlyMap<string, readonly string[]> = new Map(
  Object.entries(SETTINGS_SEARCH_TERMS),
);

export interface SettingsSearchRow {
  readonly id: string;
  readonly label: string;
}

export interface SettingsSearchSection<Row extends SettingsSearchRow> {
  readonly title?: string;
  readonly rows: readonly Row[];
}

/**
 * Keeps the rows whose label, section, or page contents match `query`, in list order, and drops
 * sections left empty. Matching is the command palette's, so both searches agree.
 */
export function filterSettingsSections<
  Row extends SettingsSearchRow,
  Section extends SettingsSearchSection<Row>,
>(sections: readonly Section[], query: string): Section[] {
  const normalizedQuery = foldSearchQuery(query);
  const rows = sections.flatMap((section) =>
    section.rows.map((row) => ({ row, section: section.title })),
  );
  const matched = normalizedQuery
    ? new Set(
        rankSearchItems(rows, ({ row, section }, options) =>
          scoreSearchTerms(
            normalizedQuery,
            [row.label, ...(section ? [section] : []), ...(termsById.get(row.id) ?? [])],
            options,
          ),
        ).map(({ item }) => item.row),
      )
    : null;
  return sections.flatMap((section) => {
    const kept = matched ? section.rows.filter((row) => matched.has(row)) : section.rows;
    return kept.length ? [{ ...section, rows: kept }] : [];
  });
}
