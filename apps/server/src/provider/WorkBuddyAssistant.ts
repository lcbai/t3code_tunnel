import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";

const assistantUrl = "https://www.workbuddy.cn/openapi/v2/localassistant";
const messageUrl = `${assistantUrl}/message`;
const operation = Schema.Literals(["status", "send", "replies"]);

class WorkBuddyRequestError extends Schema.TaggedError<WorkBuddyRequestError>()(
  "WorkBuddyRequestError",
  {
    operation,
    status: Schema.optionalKey(Schema.Int),
    apiCode: Schema.optionalKey(Schema.Int),
  },
) {
  override get message(): string {
    switch (this.status) {
      case 401:
        return "WorkBuddy 授权已失效或无效，请换用有效的 OAuth 访问令牌。";
      case 403:
        return "WorkBuddy 拒绝访问，请检查应用和用户授权是否包含本地助理权限。";
      case 429:
        return "WorkBuddy 请求过于频繁，请稍后重试。";
      default: {
        const status = this.apiCode ?? this.status;
        const detail = status === undefined ? "连接超时或接口返回异常" : `状态码 ${status}`;
        return this.operation === "send"
          ? `无法确认 WorkBuddy 是否收到指令（${detail}）。请先在 WorkBuddy 查看消息，再决定是否重发。`
          : `无法读取 WorkBuddy 本地助理（${detail}）。`;
      }
    }
  }
}

class WorkBuddyOfflineError extends Schema.TaggedError<WorkBuddyOfflineError>()(
  "WorkBuddyOfflineError",
  {},
) {
  override get message(): string {
    return "WorkBuddy 本地助理离线，请先打开并登录电脑上的 WorkBuddy。";
  }
}

const onlineStatus = Schema.Struct({ online: Schema.Boolean });
const sentMessage = Schema.Struct({ message_id: Schema.NonEmptyString });
const assistantReplies = Schema.Struct({
  messages: Schema.Array(
    Schema.Struct({
      message_id: Schema.NonEmptyString,
      role: Schema.Literals(["user", "assistant"]),
      content: Schema.Array(Schema.Unknown),
      msg_type: Schema.String,
    }),
  ),
});
const envelope = Schema.decodeUnknownEffect(
  Schema.Struct({ code: Schema.Int, data: Schema.optionalKey(Schema.Unknown) }),
);

type AccessToken = Redacted.Redacted<string>;

export class WorkBuddyAssistant extends Context.Service<
  WorkBuddyAssistant,
  {
    readonly status: (
      token: AccessToken,
    ) => Effect.Effect<typeof onlineStatus.Type, WorkBuddyRequestError>;
    readonly send: (
      token: AccessToken,
      content: string,
    ) => Effect.Effect<typeof sentMessage.Type, WorkBuddyRequestError | WorkBuddyOfflineError>;
    readonly replies: (
      token: AccessToken,
      after: string,
    ) => Effect.Effect<typeof assistantReplies.Type, WorkBuddyRequestError>;
  }
>()("t3/provider/WorkBuddyAssistant") {}

const make = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;

  const request = Effect.fn("WorkBuddyAssistant.request")(
    function* <A>(
      action: typeof operation.Type,
      token: AccessToken,
      input: HttpClientRequest.HttpClientRequest,
      schema: Schema.Decoder<A>,
    ) {
      const response = yield* http
        .execute(input.pipe(HttpClientRequest.bearerToken(token), HttpClientRequest.acceptJson))
        .pipe(Effect.mapError(() => new WorkBuddyRequestError({ operation: action })));
      if (response.status !== 200) {
        return yield* new WorkBuddyRequestError({ operation: action, status: response.status });
      }
      const body = yield* response.json.pipe(
        Effect.flatMap(envelope),
        Effect.mapError(() => new WorkBuddyRequestError({ operation: action })),
      );
      if (body.code !== 0) {
        return yield* new WorkBuddyRequestError({ operation: action, apiCode: body.code });
      }
      return yield* Schema.decodeUnknownEffect(schema)(body.data).pipe(
        Effect.mapError(() => new WorkBuddyRequestError({ operation: action })),
      );
    },
    (effect, action) =>
      effect.pipe(
        Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
        Effect.timeoutOrElse({
          duration: "15 seconds",
          orElse: () => Effect.fail(new WorkBuddyRequestError({ operation: action })),
        }),
      ),
  );

  const status = (token: AccessToken) =>
    request("status", token, HttpClientRequest.get(assistantUrl), onlineStatus);

  const send = Effect.fn("WorkBuddyAssistant.send")(function* (
    token: AccessToken,
    content: string,
  ) {
    const assistant = yield* status(token);
    if (!assistant.online) return yield* new WorkBuddyOfflineError();
    const input = HttpClientRequest.post(messageUrl).pipe(
      HttpClientRequest.bodyJsonUnsafe({ content, msg_type: "text" }),
    );
    return yield* request("send", token, input, sentMessage);
  });

  const replies = (token: AccessToken, after: string) =>
    request(
      "replies",
      token,
      HttpClientRequest.get(messageUrl).pipe(HttpClientRequest.setUrlParam("message_id", after)),
      assistantReplies,
    );

  return WorkBuddyAssistant.of({ status, send, replies });
});

export const layer = Layer.effect(WorkBuddyAssistant, make);
