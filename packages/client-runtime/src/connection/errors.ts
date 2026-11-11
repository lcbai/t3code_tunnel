import type { EnvironmentId } from "@t3tools/contracts";
import type { RemoteEnvironmentAuthError } from "../authorization/remote.ts";
import {
  ConnectionBlockedError,
  type ConnectionAttemptError,
  ConnectionTransientError,
} from "./model.ts";

export function profileMissingError(connectionId: string): ConnectionBlockedError {
  return new ConnectionBlockedError({
    reason: "configuration",
    detail: `连接配置 ${connectionId} 不可用。`,
    hop: "device",
  });
}

export function credentialMissingError(connectionId: string): ConnectionBlockedError {
  return new ConnectionBlockedError({
    reason: "authentication",
    detail: `连接凭据 ${connectionId} 不可用。`,
    hop: "device",
  });
}

export function environmentMismatchError(input: {
  readonly expected: EnvironmentId;
  readonly actual: EnvironmentId;
}): ConnectionBlockedError {
  return new ConnectionBlockedError({
    reason: "configuration",
    detail: `实际连接的环境 ${input.actual} 与预期的 ${input.expected} 不一致。`,
  });
}

export function mapRemoteEnvironmentError(
  error: RemoteEnvironmentAuthError,
): ConnectionAttemptError {
  switch (error._tag) {
    case "EnvironmentAuthInvalidError":
      return new ConnectionBlockedError({
        reason: "authentication",
        detail: "环境凭据无效。",
        traceId: error.traceId,
        hop: "server",
        via: "direct",
      });
    case "EnvironmentScopeRequiredError":
    case "EnvironmentOperationForbiddenError":
      return new ConnectionBlockedError({
        reason: "permission",
        detail: "环境凭据缺少所需权限。",
        traceId: error.traceId,
        hop: "server",
        via: "direct",
      });
    case "EnvironmentRequestInvalidError":
      return new ConnectionBlockedError({
        reason: "configuration",
        detail: "环境拒绝了授权请求。",
        traceId: error.traceId,
        hop: "server",
        via: "direct",
      });
    case "EnvironmentResourceNotFoundError":
      return new ConnectionBlockedError({
        reason: "configuration",
        detail: "找不到环境接口。",
        traceId: error.traceId,
        hop: "server",
        via: "direct",
      });
    case "RemoteEnvironmentAuthTimeoutError":
      return new ConnectionTransientError({
        reason: "timeout",
        detail: `${error.message}`,
        hop: "server",
        via: "direct",
      });
    case "RemoteEnvironmentAuthFetchError":
      return new ConnectionTransientError({
        reason: "network",
        detail: `${error.message}`,
        hop: "server",
        via: "direct",
      });
    case "EnvironmentInternalError":
      return new ConnectionTransientError({
        reason: "remote-unavailable",
        detail: "环境无法授权此连接。",
        traceId: error.traceId,
        hop: "server",
        via: "direct",
      });
    case "RemoteEnvironmentAuthInvalidJsonError":
    case "RemoteEnvironmentAuthUndeclaredStatusError":
      return new ConnectionTransientError({
        reason: "remote-unavailable",
        detail: error.message,
        hop: "server",
        via: "direct",
      });
  }
}
