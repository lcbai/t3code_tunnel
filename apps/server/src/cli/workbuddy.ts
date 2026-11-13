import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { Argument, Command } from "effect/cli";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import * as WorkBuddyAssistant from "../provider/WorkBuddyAssistant.ts";

const tokenVariable = "T3CODE_WORKBUDDY_ACCESS_TOKEN";

class WorkBuddyAuthorizationRequired extends Schema.TaggedError<WorkBuddyAuthorizationRequired>()(
  "WorkBuddyAuthorizationRequired",
  {},
) {
  override get message(): string {
    return `请为本次命令设置 ${tokenVariable}，使用已获批应用授权后取得的 WorkBuddy OAuth 访问令牌。`;
  }
}

const accessToken = Config.Redacted(tokenVariable).pipe(
  Config.map((token) => Redacted.make(Redacted.value(token).trim())),
  Effect.filterOrFail(
    (token) => /^[a-zA-Z0-9._~+/-]+=*$/.test(Redacted.value(token)),
    () => new WorkBuddyAuthorizationRequired(),
  ),
  Effect.catchTags({ ConfigError: () => Effect.fail(new WorkBuddyAuthorizationRequired()) }),
);

const printJson = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

const status = Command.make("status").pipe(
  Command.withDescription("查询电脑上的 WorkBuddy 本地助理是否在线。"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const token = yield* accessToken;
      const assistant = yield* WorkBuddyAssistant.WorkBuddyAssistant;
      yield* Console.log(yield* printJson(yield* assistant.status(token)));
    }),
  ),
);

const send = Command.make("send", {
  message: Argument.String("message").pipe(Argument.withSchema(Schema.NonEmptyString)),
}).pipe(
  Command.withDescription("发送一条指令到 WorkBuddy 本地助理，并返回消息 ID。"),
  Command.withHandler(({ message }) =>
    Effect.gen(function* () {
      const token = yield* accessToken;
      const assistant = yield* WorkBuddyAssistant.WorkBuddyAssistant;
      yield* Console.log(yield* printJson(yield* assistant.send(token, message)));
    }),
  ),
);

const replies = Command.make("replies", {
  messageId: Argument.String("message-id").pipe(Argument.withSchema(Schema.NonEmptyString)),
}).pipe(
  Command.withDescription("读取指定消息之后的 WorkBuddy 本地助理消息。"),
  Command.withHandler(({ messageId }) =>
    Effect.gen(function* () {
      const token = yield* accessToken;
      const assistant = yield* WorkBuddyAssistant.WorkBuddyAssistant;
      yield* Console.log(yield* printJson(yield* assistant.replies(token, messageId)));
    }),
  ),
);

export const workbuddyCommand = Command.make("workbuddy").pipe(
  Command.withDescription("试用腾讯 WorkBuddy 本地助理接口。"),
  Command.withSubcommands([status, send, replies]),
  Command.provide(WorkBuddyAssistant.layer.pipe(Layer.provide(FetchHttpClient.layer))),
);
