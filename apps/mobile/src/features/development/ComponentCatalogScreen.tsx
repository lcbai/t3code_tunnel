import { NativeAppBarExample } from "./NativeAppBarExample";
import { Toast } from "../../components/ui/Toast";
import { Progress } from "../../components/ui/Progress";
import { useNavigation } from "@react-navigation/native";
import { useRef, useState } from "react";
import { View, type TextInputInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText, AppTextInput } from "../../components/ui/AppText";
import { Sheet } from "../../components/ui/Sheet";
import { Chip } from "../../components/ui/Chip";
import { Menu } from "../../components/ui/Menu";
import { ListActionRow } from "../../components/ui/ListActionRow";
import { ListChoiceRow } from "../../components/ui/ListChoiceRow";
import { ListRow } from "../../components/ui/ListRow";
import { ListSection } from "../../components/ui/ListSection";
import { ListToggleRow } from "../../components/ui/ListToggleRow";
import { Button } from "../../components/ui/Button";
import { IconButton } from "../../components/ui/IconButton";
import { FloatingActionButton } from "../../components/ui/FloatingActionButton";
import { SearchField } from "../../components/ui/SearchField";
import { Notice } from "../../components/ui/Notice";
import { NumberField } from "../../components/ui/NumberField";
import { AppBar } from "../../components/ui/AppBar";
import { ScreenScrollView } from "../../components/ui/ScreenScrollView";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { SliderRow } from "../../components/ui/SliderRow";
import * as Dialog from "../../components/ui/Dialog";
import { useAppearancePreferences } from "../settings/appearance/AppearancePreferencesProvider";
import { MOBILE_THEME_IDS } from "../../lib/mobileTheme";

const CHOICES = [
  { value: "overview", label: "概览" },
  { value: "activity", label: "活动" },
];

export function ComponentCatalogScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const appearance = useAppearancePreferences();
  const [page, setPage] = useState("controls");
  const [tab, setTab] = useState("overview");
  const [enabled, setEnabled] = useState(true);
  const [value, setValue] = useState(3);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState(false);
  const [notice, setNotice] = useState(true);
  const searchRef = useRef<TextInputInstance>(null);
  const announceAction = () => setNotice(true);
  const confirm = () => {
    Dialog.confirm({
      title: "放弃变更？",
      message: "此示例仅更改本地目录状态。",
      confirmText: "放弃",
      destructive: true,
      onConfirm: () => setText(""),
    });
  };
  return (
    <View className="flex-1 bg-screen">
      <AppBar title="界面组件" onBack={() => navigation.goBack()} />
      <ScreenScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-3">
          <AppText className="text-sm text-foreground-muted">主题预览</AppText>
          <View className="flex-row flex-wrap gap-2">
            {MOBILE_THEME_IDS.filter(
              (id) => id !== "material-you" || appearance.systemColorsAvailable,
            ).map((id) => (
              <Chip
                key={id}
                label={id}
                selected={appearance.themeId === id}
                onPress={() => appearance.setThemeIdForBothAppearances(id)}
              />
            ))}
          </View>
          <SegmentedControl
            options={[
              { value: "light", label: "浅色" },
              { value: "dark", label: "深色" },
            ]}
            selected={appearance.themeAppearance}
            onSelect={appearance.setThemeMode}
            size="compact"
          />
        </View>
        <SegmentedControl
          options={[
            { value: "controls", label: "控制" },
            { value: "forms", label: "表单" },
            { value: "feedback", label: "反馈" },
          ]}
          selected={page}
          onSelect={setPage}
          size="compact"
        />
        {page === "controls" ? (
          <>
            <View className="gap-3">
              <AppText className="text-lg font-t3-semibold">列表和选择</AppText>
              <ListSection>
                <View className="p-4">
                  <SegmentedControl
                    variant="card"
                    options={CHOICES}
                    selected={tab}
                    onSelect={setTab}
                    size="compact"
                    role="tab"
                  />
                </View>
                <ListRow icon="folder" label="项目" detail="4" onPress={() => setSheet(true)} />
                <ListToggleRow
                  icon="bell.badge"
                  label="通知"
                  description="活跃会话的更新"
                  value={enabled}
                  onValueChange={setEnabled}
                />
                <ListChoiceRow label="已选选项" selected onPress={announceAction} />
                <ListActionRow icon="trash" label="放弃变更" tone="danger" onPress={confirm} />
              </ListSection>
              <SegmentedControl
                options={CHOICES}
                selected={tab}
                onSelect={setTab}
                size="compact"
                role="tab"
              />
              <View className="flex-row flex-wrap gap-2">
                <Chip
                  label="已选筛选条件"
                  selected={enabled}
                  onPress={() => setEnabled(!enabled)}
                />
                <Chip label="名称" size="small" />
                <Chip label="已停用" disabled onPress={announceAction} />
              </View>
            </View>
            <View className="gap-3">
              <NativeAppBarExample />
              <AppText className="text-lg font-t3-semibold">按钮</AppText>
              <View className="flex-row flex-wrap gap-2">
                <Button label="主要" tone="primary" onPress={announceAction} />
                <Button label="次要" onPress={announceAction} />
                <Button label="对比度" tone="contrast" onPress={announceAction} />
              </View>
              <View className="flex-row flex-wrap gap-2">
                <Button label="已停用" disabled onPress={announceAction} />
                <Button label="正在加载" loading onPress={announceAction} />
                <IconButton
                  accessibilityLabel="打开面板示例"
                  icon="plus"
                  variant="tonal"
                  onPress={() => setSheet(true)}
                />
              </View>
            </View>
          </>
        ) : null}
        {page === "forms" ? (
          <View className="gap-3">
            <AppText className="text-lg font-t3-semibold">表单</AppText>
            <AppTextInput
              accessibilityLabel="名称示例"
              placeholder="名称"
              value={text}
              onChangeText={setText}
            />
            <View className="flex-row">
              <SearchField
                inputRef={searchRef}
                accessibilityLabel="搜索示例"
                clearAccessibilityLabel="Clear examples search"
                placeholder="搜索示例"
                value={search}
                onChangeText={setSearch}
                autoFocus={false}
              />
            </View>
            <View className="flex-row items-center justify-between">
              <AppText>数量</AppText>
              <NumberField
                label="计数示例"
                min={1}
                max={10}
                value={value}
                onValueChange={setValue}
              />
            </View>
            <ListSection>
              <SliderRow
                icon="textformat.size"
                label="滑块示例"
                valueLabel={String(value)}
                min={1}
                max={10}
                step={1}
                value={value}
                onChange={setValue}
              />
            </ListSection>
          </View>
        ) : null}
        {page === "feedback" ? (
          <View className="gap-3">
            <AppText className="text-lg font-t3-semibold">反馈与展示</AppText>
            <Notice message="操作未完成。请重试。" tone="danger" />
            <Button label="显示提示" onPress={announceAction} />
            <View className="flex-row flex-wrap gap-2">
              <Button label="底部面板" onPress={() => setSheet(true)} />
              <Button label="对话框" onPress={confirm} />
              <Button
                label="提示"
                onPress={() =>
                  Dialog.alert("提示示例", "请选择操作。", [
                    {
                      text: "更多信息",
                      onPress: () => Dialog.alert("更多信息", "第二条提示保持打开。"),
                    },
                    { text: "取消", style: "cancel" },
                    { text: "继续", onPress: announceAction },
                  ])
                }
              />
              <Button
                label="提示词"
                onPress={() =>
                  Dialog.prompt({
                    title: "重命名示例",
                    initialValue: text,
                    confirmText: "重命名",
                    onConfirm: setText,
                  })
                }
              />
              <Menu
                title="菜单示例"
                actions={[
                  { id: "copy", title: "复制", image: "doc.on.doc" },
                  { id: "discard", title: "放弃", attributes: { destructive: true } },
                ]}
                onPressAction={({ nativeEvent }) =>
                  nativeEvent.event === "discard" ? confirm() : announceAction()
                }
              >
                <Chip label="菜单" trailingIcon="chevron.down" />
              </Menu>
            </View>
            <Progress value={0.6} label="上传示例" />
            <Progress label="正在连接" />
            <View className="items-start">
              <FloatingActionButton
                label="新建会话"
                icon="plus"
                variant="extended"
                tone="primary"
                onPress={() => setSheet(true)}
              />
            </View>
          </View>
        ) : null}
      </ScreenScrollView>
      {page === "feedback" && notice ? (
        <View
          collapsable={false}
          className="absolute inset-x-3 z-[100]"
          style={{ bottom: insets.bottom + 12 }}
          pointerEvents="box-none"
        >
          <Toast
            message="变更已准备好，可以审查。"
            tone="success"
            dismissMode="swipe"
            action={{
              label: "撤销",
              onPress: () => {
                setNotice(false);
                setText("Restored example");
              },
            }}
            onDismiss={() => setNotice(false)}
          />
        </View>
      ) : null}
      {sheet ? (
        <Sheet title="底部面板示例" onClose={() => setSheet(false)}>
          <ScreenScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerClassName="p-4"
          >
            <ListSection>
              <ListChoiceRow
                label="概览"
                selected={tab === "overview"}
                onPress={() => setTab("overview")}
              />
              <ListChoiceRow
                label="活动"
                selected={tab === "activity"}
                onPress={() => setTab("activity")}
              />
            </ListSection>
          </ScreenScrollView>
        </Sheet>
      ) : null}
    </View>
  );
}
