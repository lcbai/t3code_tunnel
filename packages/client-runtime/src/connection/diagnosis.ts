import * as DateTime from "effect/DateTime";

import type { ConnectionHop, SupervisorConnectionState } from "./model.ts";

export type ConnectionHopResult = "ok" | "failed" | "unchecked";

export interface ConnectionDiagnosisHop {
  readonly hop: ConnectionHop;
  readonly label: string;
  readonly result: ConnectionHopResult;
}

export interface ConnectionDiagnosis {
  readonly headline: string;
  readonly hops: ReadonlyArray<ConnectionDiagnosisHop>;
  readonly steps: ReadonlyArray<string>;
  readonly facts: ReadonlyArray<readonly [label: string, value: string]>;
}

export interface ConnectionDiagnosisInput {
  readonly hostLabel: string;
  readonly state: SupervisorConnectionState;
  readonly clientVersion?: string | undefined;
  readonly serverVersion?: string | null | undefined;
}

export function presentConnectionDiagnosis(
  input: ConnectionDiagnosisInput,
): ConnectionDiagnosis | null {
  const { state, hostLabel: host } = input;
  const failure = state.lastFailure;
  const offline = state.network === "offline" || state.phase === "offline";
  if (!offline && failure === null) return null;

  const deviceFailed = offline || failure?.hop === "device";
  const needsUpdate = failure?._tag === "ConnectionBlockedError" && failure.serverUpdateRequired;
  const credentialsRejected =
    failure?.reason === "authentication" || failure?.reason === "permission";
  const headline = offline
    ? "此设备已离线"
    : deviceFailed
      ? "此设备无法建立连接"
      : needsUpdate
        ? `${host} 上的 T3 Code 版本过旧`
        : credentialsRejected
          ? `${host} 上的 T3 Code 拒绝了此设备的连接`
          : `${host} 上的 T3 Code 没有响应`;
  const steps = offline
    ? ["让此设备重新联网。T3 Code 会自动重连。"]
    : deviceFailed
      ? [`重新启动此设备上的 T3 Code。如果仍无法连接，请移除并重新添加 ${host}。`]
      : needsUpdate
        ? [`在 ${host} 上更新 T3 Code，然后重试。`]
        : credentialsRejected
          ? [`在 ${host} 上生成配对码，然后重新连接。`]
          : [`确认 ${host} 上的 T3 Code 正在运行。如果重试后仍失败，请复制诊断信息。`];
  const facts: Array<readonly [string, string]> = [];
  const add = (label: string, value: string | number | null | undefined) => {
    if (value !== null && value !== undefined && value !== "") facts.push([label, String(value)]);
  };
  add("原因", failure?.failureCause ?? failure?.reason);
  add("HTTP 状态", failure?.httpStatus);
  add("尝试次数", state.attempt > 0 ? state.attempt : null);
  add(
    "下次重试",
    state.retryAt === null ? null : DateTime.formatIso(DateTime.makeUnsafe(state.retryAt)),
  );
  add("应用版本", input.clientVersion);
  add("服务器版本", input.serverVersion);
  add("错误详情", failure?.detail);
  add("跟踪 ID", failure?.traceId);

  return {
    headline,
    hops: [
      {
        hop: "device",
        label: "此设备",
        result: deviceFailed ? "failed" : failure?.hop ? "ok" : "unchecked",
      },
      {
        hop: "server",
        label: `${host} 上的 T3 Code`,
        result: deviceFailed ? "unchecked" : "failed",
      },
    ],
    steps,
    facts,
  };
}

const HOP_MARK = { ok: "正常", failed: "失败", unchecked: "未检查" } as const;

export function connectionDiagnosisText(hostLabel: string, diagnosis: ConnectionDiagnosis): string {
  return [
    `T3 Code 与 ${hostLabel} 的连接：${diagnosis.headline}`,
    "",
    ...diagnosis.hops.map((hop) => `${hop.label}：${HOP_MARK[hop.result]}`),
    "",
    ...diagnosis.facts.map(([label, value]) => `${label}：${value}`),
  ].join("\n");
}
