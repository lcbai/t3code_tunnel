import type { StatusTone } from "../../components/StatusPill";
import type { RemoteClientConnectionState } from "../../lib/connection";

export function connectionTone(state: RemoteClientConnectionState): StatusTone {
  switch (state) {
    case "connected":
      return {
        label: "已连接",
        pillClassName: "bg-adaptive-emerald-500-a12-a16",
        textClassName: "text-adaptive-emerald-700-300",
      };
    case "reconnecting":
      return {
        label: "正在重新连接",
        pillClassName: "bg-warning",
        textClassName: "text-warning-foreground",
      };
    case "connecting":
      return {
        label: "正在连接",
        pillClassName: "bg-update",
        textClassName: "text-update-foreground",
      };
    case "unsupported":
      return {
        label: "不支持此客户端",
        pillClassName: "bg-subtle",
        textClassName: "text-foreground-secondary",
      };
    case "error":
      return {
        label: "连接失败",
        pillClassName: "bg-danger",
        textClassName: "text-danger-foreground",
      };
    case "offline":
      return {
        label: "离线",
        pillClassName: "bg-danger",
        textClassName: "text-danger-foreground",
      };
    case "available":
      return {
        label: "可用",
        pillClassName: "bg-subtle",
        textClassName: "text-foreground-secondary",
      };
  }
}
