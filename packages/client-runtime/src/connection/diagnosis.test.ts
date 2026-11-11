import { describe, expect, it } from "@effect/vitest";

import { presentConnectionDiagnosis } from "./diagnosis.ts";
import {
  AVAILABLE_CONNECTION_STATE,
  ConnectionBlockedError,
  ConnectionTransientError,
} from "./model.ts";

describe("presentConnectionDiagnosis", () => {
  it("reports an offline device before a prior server failure", () => {
    const diagnosis = presentConnectionDiagnosis({
      hostLabel: "Mac mini",
      state: {
        ...AVAILABLE_CONNECTION_STATE,
        phase: "offline",
        network: "offline",
        lastFailure: new ConnectionTransientError({
          reason: "timeout",
          detail: "timeout",
          hop: "server",
        }),
      },
    });

    expect(diagnosis?.hops.map(({ hop, result }) => [hop, result])).toEqual([
      ["device", "failed"],
      ["server", "unchecked"],
    ]);
  });

  it("reports a rejected device credential on a direct server connection", () => {
    const diagnosis = presentConnectionDiagnosis({
      hostLabel: "Mac mini",
      state: {
        ...AVAILABLE_CONNECTION_STATE,
        phase: "blocked",
        lastFailure: new ConnectionBlockedError({
          reason: "authentication",
          detail: "rejected",
          hop: "server",
          httpStatus: 401,
        }),
      },
    });

    expect(diagnosis?.hops.map(({ hop, result }) => [hop, result])).toEqual([
      ["device", "ok"],
      ["server", "failed"],
    ]);
    expect(diagnosis?.facts).toContainEqual(["HTTP 状态", "401"]);
  });
});
