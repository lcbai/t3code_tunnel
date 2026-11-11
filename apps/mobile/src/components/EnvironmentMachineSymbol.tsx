import type { EnvironmentMachineKind } from "@t3tools/contracts";
import { SymbolView, type AppSymbolName } from "./ui/AppSymbol";

export const ENVIRONMENT_MACHINE_SYMBOLS = {
  server: "server.rack",
  cloud: "cloud",
  linux: "terminal",
  desktop: "desktopcomputer",
  laptop: "laptopcomputer",
  "mac-mini": "macmini",
  "mac-studio": "macstudio",
} as const satisfies Record<EnvironmentMachineKind, AppSymbolName>;

const ENVIRONMENT_MACHINE_KIND_LABELS: Record<EnvironmentMachineKind, string> = {
  server: "服务器",
  cloud: "云主机",
  linux: "Linux/WSL",
  desktop: "台式机",
  laptop: "笔记本电脑",
  "mac-mini": "迷你电脑",
  "mac-studio": "工作站",
};

export function EnvironmentMachineSymbol(props: {
  readonly kind: EnvironmentMachineKind;
  readonly size: number;
  readonly tintColorClassName: string;
}) {
  return (
    <SymbolView
      accessibilityLabel={ENVIRONMENT_MACHINE_KIND_LABELS[props.kind]}
      name={ENVIRONMENT_MACHINE_SYMBOLS[props.kind]}
      size={props.size}
      tintColorClassName={props.tintColorClassName}
      type="monochrome"
    />
  );
}
