import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as TestConsole from "effect/testing/TestConsole";
import { Command } from "effect/cli";
import { FetchHttpClient } from "effect/http";
import { vi } from "vite-plus/test";

import { workbuddyCommand } from "./workbuddy.ts";

const runCli = (args: ReadonlyArray<string>, fetch: typeof globalThis.fetch) =>
  Command.runWith(workbuddyCommand, { version: "0.0.0" })(args).pipe(
    Effect.provide(
      Layer.merge(
        NodeServices.layer,
        ConfigProvider.layer(
          ConfigProvider.fromEnv({ env: { T3CODE_WORKBUDDY_ACCESS_TOKEN: "test-token" } }),
        ),
      ),
    ),
    Effect.provideService(FetchHttpClient.Fetch, fetch),
  );

const response = (data: object) => Response.json({ code: 0, msg: "success", data });

it.effect("checks the local assistant, sends a message, and reads incremental replies", () =>
  Effect.gen(function* () {
    const prompt = "只回复连接成功";
    const reply = {
      message_id: "message-2",
      role: "assistant",
      content: ["连接成功"],
      msg_type: "text",
    };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ online: true }))
      .mockResolvedValueOnce(response({ online: true }))
      .mockResolvedValueOnce(response({ message_id: "message-1" }))
      .mockResolvedValueOnce(
        response({
          messages: [{ ...reply, created_at: "2026-11-13T00:00:00Z", attachments: [] }],
        }),
      );

    yield* runCli(["status"], fetch);
    yield* runCli(["send", prompt], fetch);
    yield* runCli(["replies", "message-1"], fetch);

    const requests = fetch.mock.calls.map(([url, init]) => new Request(url, init));
    expect(requests.map((request) => [request.method, request.url])).toEqual([
      ["GET", "https://www.workbuddy.cn/openapi/v2/localassistant"],
      ["GET", "https://www.workbuddy.cn/openapi/v2/localassistant"],
      ["POST", "https://www.workbuddy.cn/openapi/v2/localassistant/message"],
      ["GET", "https://www.workbuddy.cn/openapi/v2/localassistant/message?message_id=message-1"],
    ]);
    expect(requests.map((request) => request.headers.get("authorization"))).toEqual(
      Array.from({ length: 4 }, () => "Bearer test-token"),
    );
    expect(fetch.mock.calls.every(([, init]) => init?.redirect === "error")).toBe(true);
    const sendRequest = requests[2]!;
    expect(sendRequest.headers.get("content-type")).toMatch(/^application\/json\b/);
    expect(yield* Effect.promise(() => sendRequest.json())).toEqual({
      content: prompt,
      msg_type: "text",
    });
    expect((yield* TestConsole.logLines).map((line) => JSON.parse(String(line)))).toEqual([
      { online: true },
      { message_id: "message-1" },
      { messages: [reply] },
    ]);
  }).pipe(Effect.provide(TestConsole.layer)),
);

it.effect.each([
  { reason: "the local assistant is offline", status: 200, errorStatus: undefined },
  { reason: "the token is invalid", status: 401, errorStatus: "invalid_token" },
  { reason: "the scope is insufficient", status: 403, errorStatus: "insufficient_scope" },
])("does not submit a message when $reason", ({ status, errorStatus }) =>
  Effect.gen(function* () {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        errorStatus === undefined
          ? response({ online: false })
          : Response.json({ error: { code: status, status: errorStatus } }, { status }),
      );

    yield* runCli(["send", "只回复连接成功"], fetch).pipe(Effect.flip);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("https://www.workbuddy.cn/openapi/v2/localassistant");
    expect(init?.method).toBe("GET");
    expect(yield* TestConsole.logLines).toEqual([]);
  }).pipe(Effect.provide(TestConsole.layer)),
);
