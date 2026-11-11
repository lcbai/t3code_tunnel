import type { MenuAction } from "@react-native-menu/menu";

export function buildThreadTitleRegenerationMenuItems(input: {
  readonly supported: boolean;
  readonly isRegenerating: boolean;
}): MenuAction[] {
  if (!input.supported) return [];

  return [
    {
      id: "regenerate-title",
      title: input.isRegenerating ? "正在重新生成…" : "重新生成标题",
      image: "arrow.clockwise",
      ...(input.isRegenerating ? { attributes: { disabled: true } } : {}),
    },
  ];
}
