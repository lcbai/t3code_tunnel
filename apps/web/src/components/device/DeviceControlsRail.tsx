import type { DeviceHostSummary, DevicePlatform } from "@t3tools/contracts";
import {
  Camera,
  ChevronLeft,
  Home,
  Keyboard,
  Box,
  Maximize,
  MoreHorizontal,
  PictureInPicture2,
  Power,
  RotateCcw,
  SlidersHorizontal,
  Smartphone,
  Square,
  Type,
  X,
} from "lucide-react";
import { Moon, Sun } from "lucide";
import type { ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { MorphIcon } from "~/components/MorphIcon";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
} from "~/components/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import type { DeviceStreamHandle, DeviceViewControls } from "./DeviceStreamView";
import type { DeviceControls } from "./useDeviceControls";

export function DeviceControlsRail(props: {
  platform: DevicePlatform;
  hostKind: DeviceHostSummary["kind"] | undefined;
  handle: DeviceStreamHandle | null;
  view: DeviceViewControls;
  controls: DeviceControls;
  screenshotPending: boolean;
  onScreenshot: () => void;
  toolsOpen: boolean;
  onTools: () => void;
  onFloat: () => void;
  onClose: () => void;
  onPowerOff: () => void;
}) {
  const { view, handle, controls } = props;
  const popupSide = "left";
  const settings = controls.detail?.settings;
  const inputDisabled = !handle?.inputConnected;
  const runsHostCommands = props.hostKind === "local" || props.hostKind === "ssh";
  const nextAppearance = settings?.appearance === "dark" ? "light" : "dark";
  return (
    <aside
      aria-label="设备控制"
      data-layout="rail"
      className="pointer-events-none absolute inset-y-0 right-0 z-10 flex w-14 flex-col items-center gap-2 overflow-y-auto [justify-content:safe_center] py-3 pr-2 [scrollbar-width:none]"
    >
      <div className="pointer-events-auto flex shrink-0 flex-col items-center gap-1 overflow-y-auto rounded-full border border-border/50 bg-background/80 p-2 shadow-sm [scrollbar-width:none]">
        <RailButton
          tooltipSide={popupSide}
          label="主页"
          disabled={inputDisabled}
          onClick={() => handle?.pressButton("home")}
        >
          <Home />
        </RailButton>
        {props.platform === "android" ? (
          <>
            <RailButton
              tooltipSide={popupSide}
              label="返回"
              disabled={inputDisabled}
              onClick={() => handle?.pressButton("back")}
            >
              <ChevronLeft />
            </RailButton>
            <RailButton
              tooltipSide={popupSide}
              label="近期"
              disabled={inputDisabled}
              onClick={() => handle?.pressButton("recents")}
            >
              <Square />
            </RailButton>
            {runsHostCommands ? (
              <Menu>
                <MenuTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="旋转设备"
                      disabled={controls.disabled}
                    />
                  }
                >
                  <RotateCcw />
                </MenuTrigger>
                <MenuPopup side={popupSide}>
                  <MenuItem
                    onClick={() => void controls.act({ type: "setOrientation", value: "portrait" })}
                  >
                    纵向
                  </MenuItem>
                  <MenuItem
                    onClick={() =>
                      void controls.act({ type: "setOrientation", value: "landscape_left" })
                    }
                  >
                    风景
                  </MenuItem>
                </MenuPopup>
              </Menu>
            ) : null}
          </>
        ) : props.hostKind === "simlock" ? null : (
          <RailButton
            tooltipSide={popupSide}
            label="旋转设备"
            disabled={inputDisabled || !!view.keyboard?.attached}
            onClick={() => handle?.rotate()}
          >
            <RotateCcw />
          </RailButton>
        )}
        {runsHostCommands ? (
          <>
            <RailDivider />
            <RailButton
              tooltipSide={popupSide}
              label={`切换设备到${nextAppearance} mode`}
              disabled={controls.disabled || !settings?.appearance}
              onClick={() => void controls.act({ type: "setAppearance", value: nextAppearance })}
            >
              <MorphIcon icon={settings?.appearance === "dark" ? Sun : Moon} />
            </RailButton>
            <Menu>
              <MenuTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="设备文本大小"
                    title="设备文本大小"
                    disabled={controls.disabled || !settings?.textSize}
                  />
                }
              >
                <Type />
              </MenuTrigger>
              <MenuPopup side={popupSide} className="min-w-40">
                <MenuRadioGroup
                  value={settings?.textSize ?? ""}
                  onValueChange={(value) => {
                    if (
                      value === "small" ||
                      value === "default" ||
                      value === "large" ||
                      value === "extra-large"
                    )
                      void controls.act({ type: "setTextSize", value });
                  }}
                >
                  {(
                    [
                      ["small", "Small"],
                      ["default", "Default"],
                      ["large", "Large"],
                      ["extra-large", "Extra large"],
                    ] as const
                  ).map(([value, label]) => (
                    <MenuRadioItem key={value} value={value}>
                      <span className="flex items-center gap-2">
                        <span className="flex-1">{label}</span>
                        <MenuRadioItemIndicator />
                      </span>
                    </MenuRadioItem>
                  ))}
                </MenuRadioGroup>
              </MenuPopup>
            </Menu>
            <RailButton
              tooltipSide={popupSide}
              label="设备工具"
              pressed={props.toolsOpen}
              onClick={props.onTools}
            >
              <SlidersHorizontal />
            </RailButton>
          </>
        ) : null}
        {props.hostKind === "simlock" ? null : (
          <RailButton
            tooltipSide={popupSide}
            label={props.screenshotPending ? "抓取截图" : "保存截图"}
            disabled={!view.streaming || props.screenshotPending}
            onClick={props.onScreenshot}
          >
            <Camera />
          </RailButton>
        )}
        <Menu>
          <MenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="更多设备动作"
                title="更多设备动作"
              />
            }
          >
            <MoreHorizontal />
          </MenuTrigger>
          <MenuPopup side={popupSide} align="end">
            <MenuItem onClick={props.onFloat}>
              <PictureInPicture2 />
              聊天时浮点滴设备
            </MenuItem>
            <MenuItem onClick={props.onClose}>
              <X />
              关闭设备面板
            </MenuItem>
            <MenuSeparator />
            <MenuItem variant="destructive" onClick={props.onPowerOff}>
              <Power />
              {props.hostKind === "simlock" ? "将设备返回池中" : "断电设备"}
            </MenuItem>
          </MenuPopup>
        </Menu>
        <RailDivider />
        <RailButton
          tooltipSide={popupSide}
          label="3D 视图"
          pressed={view.phone}
          disabled={!view.streaming || !!view.phoneUnavailableReason}
          description={view.phoneUnavailableReason ?? undefined}
          onClick={view.showPhone}
        >
          <Box />
        </RailButton>
        <RailButton
          tooltipSide={popupSide}
          label="平面视图"
          pressed={!view.phone}
          disabled={!view.streaming}
          onClick={view.showFlat}
        >
          <Smartphone />
        </RailButton>
        {view.keyboard ? (
          <RailButton
            tooltipSide={popupSide}
            label={view.keyboard.attached ? "解开魔法键盘" : "附加魔法键盘"}
            pressed={view.keyboard.attached}
            onClick={view.keyboard.toggle}
          >
            <Keyboard />
          </RailButton>
        ) : null}
        {view.phone ? (
          <RailButton tooltipSide={popupSide} label="还原三维视图" onClick={view.resetView}>
            <Maximize />
          </RailButton>
        ) : null}
      </div>
      {view.foldingControls}
    </aside>
  );
}

function RailDivider() {
  return <div aria-hidden className="my-1 h-px w-5 shrink-0 bg-border/70" />;
}

function RailButton(props: {
  tooltipSide: "left" | "bottom";
  label: string;
  description?: string | undefined;
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const button = (
    <Button
      size="icon-sm"
      variant={props.pressed ? "secondary" : "ghost"}
      aria-label={props.label}
      aria-pressed={props.pressed}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  );
  return (
    <Tooltip>
      {props.disabled && props.description ? (
        <TooltipTrigger
          render={
            <span className="inline-flex" tabIndex={0} role="group" aria-label={props.label} />
          }
        >
          {button}
        </TooltipTrigger>
      ) : (
        <TooltipTrigger render={button} />
      )}
      <TooltipPopup side={props.tooltipSide}>{props.description ?? props.label}</TooltipPopup>
    </Tooltip>
  );
}
