import type { ScheduledTaskWebhookEndpoint } from "@t3tools/contracts";
import { isLocalLoopbackHost } from "@t3tools/shared/hostClassification";

export interface WebhookAddress {
  readonly address: string;
  readonly copyable: boolean;
  readonly note: string | null;
}

export function webhookAddress(
  endpoint: ScheduledTaskWebhookEndpoint,
  httpBaseUrl: string | null,
): WebhookAddress {
  if (endpoint.url !== null) {
    return { address: endpoint.url, copyable: true, note: null };
  }
  if (httpBaseUrl === null) {
    return {
      address: endpoint.path,
      copyable: false,
      note: "请在服务器地址后加上此路径。",
    };
  }
  const url = new URL(endpoint.path, httpBaseUrl);
  return {
    address: url.href,
    copyable: true,
    note: isLocalLoopbackHost(url.hostname)
      ? "此地址只能从这台电脑访问。"
      : "可从能访问此服务器的网络调用，例如 Tailscale 或你配置的反向代理。",
  };
}
