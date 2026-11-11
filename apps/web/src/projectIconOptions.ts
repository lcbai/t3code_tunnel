import { lucideIconNames } from "./lib/lucideIconByName";
export { PROJECT_ICON_COLORS, projectIconColorClassName } from "./projectIconColors";

const POPULAR_PROJECT_ICONS: ReadonlyArray<string> = [
  "folder-code",
  "code-2",
  "terminal",
  "globe-2",
  "server",
  "database",
  "bot",
  "sparkles",
  "smartphone",
  "monitor",
  "cloud-cog",
  "package",
  "book-open",
  "flask-conical",
  "shield-check",
  "rocket",
  "gamepad-2",
  "music",
  "image",
  "shopping-bag",
  "git-branch",
  "workflow",
  "wrench",
  "layers-3",
];

export const PROJECT_EMOJIS: ReadonlyArray<{ readonly emoji: string; readonly label: string }> = [
  { emoji: "💻", label: "计算机" },
  { emoji: "🛠️", label: "工具" },
  { emoji: "🚀", label: "火箭" },
  { emoji: "🤖", label: "机器人" },
  { emoji: "✨", label: "闪光灯" },
  { emoji: "⚡", label: "闪电" },
  { emoji: "🌐", label: "网页端" },
  { emoji: "📱", label: "移动端" },
  { emoji: "🖥️", label: "桌面端" },
  { emoji: "⌨️", label: "键盘" },
  { emoji: "⚙️", label: "齿轮" },
  { emoji: "🗄️", label: "数据库" },
  { emoji: "☁️", label: "云头" },
  { emoji: "📦", label: "软件包" },
  { emoji: "📚", label: "书籍" },
  { emoji: "🧪", label: "试管" },
  { emoji: "🔒", label: "锁定" },
  { emoji: "🎮", label: "游戏" },
  { emoji: "🎵", label: "音乐" },
  { emoji: "🎬", label: "电影" },
  { emoji: "🖼️", label: "图片" },
  { emoji: "🛍️", label: "购物" },
  { emoji: "🔥", label: "开火" },
  { emoji: "💡", label: "思想" },
  { emoji: "🧩", label: "谜题" },
  { emoji: "📊", label: "图表" },
  { emoji: "🧠", label: "大脑" },
  { emoji: "🦄", label: "独角兽" },
  { emoji: "🐙", label: "八面体" },
  { emoji: "🌱", label: "种子" },
];

export function filterProjectIconNames(query: string): ReadonlyArray<string> {
  const normalized = query.trim().toLowerCase().replaceAll(/\s+/g, "-");
  if (!normalized) return POPULAR_PROJECT_ICONS;
  return lucideIconNames.filter((name) => name.includes(normalized)).slice(0, 60);
}

export function firstEmoji(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed);
  const segment = segments[Symbol.iterator]().next().value?.segment;
  const isFlag = /^\p{Regional_Indicator}{2}$/u.test(segment ?? "");
  const isKeycap = /^[#*0-9]\uFE0F?\u20E3$/u.test(segment ?? "");
  if (!segment || (!/\p{Extended_Pictographic}/u.test(segment) && !isFlag && !isKeycap)) {
    return null;
  }
  return segment;
}
