import { describe, expect, it } from "vite-plus/test";

import { summarizeT3ToolCalls, type T3ToolSummaryCall } from "./t3ToolSummary.ts";

function completed(input: unknown, output?: unknown): T3ToolSummaryCall {
  return { input, output, outcome: "completed" };
}

describe("summarizeT3ToolCalls", () => {
  it("reads provider result envelopes without treating JSON in the message as result data", () => {
    const result = { messageId: "message-1", threadId: "actual-thread" };
    const json = JSON.stringify(result);
    const outputs = [
      result,
      { structuredContent: result },
      [{ type: "text", text: json }],
      { content: [{ text: { text: json } }], isError: false },
      json,
    ];
    const calls = outputs.map((output) =>
      completed(
        {
          toolName: "t3_thread_send",
          args: { threadId: "input-thread", message: '{"threadId":"fake"}' },
        },
        output,
      ),
    );
    expect(summarizeT3ToolCalls("thread-send", calls).label).toBe("已发送 1 条消息给 1 个会话");
    expect(
      summarizeT3ToolCalls("thread-send", [
        completed({ toolName: "t3_thread_send", args: { threadId: "input-thread" } }),
        completed({ threadId: "input-thread" }),
      ]).label,
    ).toBe("已发送 2 条消息给 1 个会话");
  });

  it("counts the pull requests batch link and unlink calls changed", () => {
    const urls = ["https://github.com/o/r/pull/1", "https://github.com/o/r/pull/1", "not-a-pr"];
    const links = completed({ urls }, { linkedCount: 1 });
    expect(summarizeT3ToolCalls("link-pr", [links, completed({ number: 3 })]).label).toBe(
      "已关联 2 个拉取请求",
    );
    expect(summarizeT3ToolCalls("link-pr", [completed({ urls }, {})]).label).toBe("已关联拉取请求");
    const batch = completed({ states: ["merged"] }, { unlinkedCount: 2 });
    expect(summarizeT3ToolCalls("unlink-pr", [batch, completed({ number: 3 })]).label).toBe(
      "已取消关联 3 个拉取请求",
    );
    const uncounted = completed({ states: ["merged"] }, { isError: false });
    expect(summarizeT3ToolCalls("unlink-pr", [uncounted]).label).toBe("已取消关联拉取请求");
  });

  it("excludes failed and unfinished sends even if the provider reports completed", () => {
    const calls: T3ToolSummaryCall[] = [
      completed({ threadId: "success" }, { messageId: "ok", threadId: "success" }),
      completed(
        { threadId: "failed" },
        { isError: true, structuredContent: { threadId: "failed" } },
      ),
      completed({ threadId: "failed" }, [
        { type: "text", text: JSON.stringify({ _tag: "OrchestratorMcpFailure" }) },
      ]),
      { input: { threadId: "cancelled" }, output: undefined, outcome: "unfinished" },
    ];
    expect(summarizeT3ToolCalls("thread-send", calls)).toEqual({
      label: "已发送 1 条消息给 1 个会话",
      failedCount: 2,
    });
    expect(summarizeT3ToolCalls("thread-send", [calls[1]!])).toEqual({
      label: "尝试发送 1 条消息给 1 个会话",
      failedCount: 1,
    });
  });

  it("does not confuse a child's failure or wait timeout with failure of the orchestration call", () => {
    const failedChild = { taskId: "task-1", status: "failed", summary: "command not found" };
    expect(
      summarizeT3ToolCalls("delegate", [completed({}, failedChild), completed({}, failedChild)]),
    ).toEqual({
      label: "已委派 1 个任务",
      failedCount: 0,
    });
    expect(
      summarizeT3ToolCalls(
        "task-status",
        Array.from({ length: 4 }, () => completed({ taskId: "task-1" }, failedChild)),
      ).label,
    ).toBe("已检查任务状态 4 次");
    expect(
      summarizeT3ToolCalls("thread-wait", [
        completed({ threadId: "thread-1" }, { threadId: "thread-1", timedOut: true }),
      ]),
    ).toEqual({
      label: "已等待 1 个会话",
      failedCount: 0,
    });
  });
});
