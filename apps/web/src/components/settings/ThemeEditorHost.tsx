import { lazy, Suspense, useSyncExternalStore } from "react";

import { useTheme } from "../../hooks/useTheme";
import {
  getThemeDefinition,
  subscribeToCustomThemes,
  type ThemeAppearance,
  type ThemeDefinition,
} from "../../themePalette";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { useThemeEditorStore } from "./themeEditorStore";

const ThemeEditorPanel = lazy(() =>
  import("./ThemeEditorPanel").then((module) => ({ default: module.ThemeEditorPanel })),
);

function useThemeDefinition(id: string | null | undefined) {
  return useSyncExternalStore(
    subscribeToCustomThemes,
    () => (id ? (getThemeDefinition(id) ?? null) : null),
    () => null,
  );
}

export function ThemeEditorHost() {
  const session = useThemeEditorStore((store) => store.session);
  const closeThemeEditor = useThemeEditorStore((store) => store.closeThemeEditor);
  const { theme, setTheme, themeHalves, refreshTheme } = useTheme();
  const editingTheme = useThemeDefinition(session?.editingThemeId);
  const seedTheme = useThemeDefinition(session?.seedThemeId);

  const handleSaved = (
    savedTheme: ThemeDefinition,
    { created, mergedAppearance }: { created: boolean; mergedAppearance?: ThemeAppearance },
  ) => {
    if (mergedAppearance) {
      if (!setTheme(savedTheme.id)) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "无法保存您的主题",
            description: "浏览器存储不可用，因此更改没有保存。",
          }),
        );
        return false;
      }
      toastManager.add(
        stackedThreadToast({
          type: "success",
          title: `${savedTheme.label} 更新`,
          description: `添加了它的${mergedAppearance} 调色板。`,
        }),
      );
      return true;
    }
    if (!created) {
      // Reapply the palette without setTheme, which would clear a mix containing the edited theme.
      const wasActive =
        getThemeDefinition(theme)?.id === savedTheme.id ||
        themeHalves?.light === savedTheme.id ||
        themeHalves?.dark === savedTheme.id;
      if (wasActive) refreshTheme();
      toastManager.add(
        stackedThreadToast({
          type: "success",
          title: `${savedTheme.label} 已保存`,
          description: wasActive ? "您的更改现已激活。" : "您的更改已被保存。",
        }),
      );
      return true;
    }

    if (!setTheme(savedTheme.id)) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "无法保存您的主题",
          description: "浏览器存储不可用，因此更改没有保存。",
        }),
      );
      return false;
    }
    toastManager.add(
      stackedThreadToast({
        type: "success",
        title: `${savedTheme.label} 创建`,
        description: "现时已活跃。",
      }),
    );
    return true;
  };

  if (!session) return null;

  return (
    <Suspense fallback={null}>
      <ThemeEditorPanel
        editingTheme={editingTheme}
        initialAppearance={session.initialAppearance}
        key={session.id}
        onOpenChange={(open) => {
          if (!open) closeThemeEditor();
        }}
        onSaved={handleSaved}
        open
        restoreTheme={refreshTheme}
        seedName={session.seedName ?? undefined}
        seedTheme={seedTheme}
      />
    </Suspense>
  );
}
