import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import type {
  EnvironmentId,
  ProviderAuthRespondInput,
  ProviderAuthResponse,
  ProviderInstanceId,
  ServerProvider,
} from "@t3tools/contracts";
import { lazy, Suspense, useRef, useState } from "react";
import { CopyIcon } from "lucide-react";

import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { ensureLocalApi } from "../../localApi";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SettingsRow } from "./settingsLayout";
import { RedactedSensitiveText } from "./RedactedSensitiveText";

const ProviderAuthTerminal = lazy(() => import("./ProviderAuthTerminal"));

export function ProviderAuthenticationSection({
  environmentId,
  environmentLabel,
  instanceId,
  provider,
  readOnly,
}: {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly instanceId: ProviderInstanceId;
  readonly provider: ServerProvider;
  readonly readOnly: boolean;
}) {
  const target = { environmentId, input: { instanceId } };
  const query = useEnvironmentQuery(serverEnvironment.providerAuthState(target));
  const commands = { reportFailure: false, reportDefect: false };
  const start = useAtomCommand(serverEnvironment.startProviderAuth, commands);
  const respond = useAtomCommand(serverEnvironment.respondProviderAuth, commands);
  const complete = useAtomCommand(serverEnvironment.completeProviderAuth, commands);
  const cancel = useAtomCommand(serverEnvironment.cancelProviderAuth, commands);
  const logout = useAtomCommand(serverEnvironment.logoutProviderAuth, commands);
  const [methodId, setMethodId] = useState("");
  const [draft, setDraft] = useState({ id: "", values: {} as Record<string, string> });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const terminalQueue = useRef<ProviderAuthRespondInput[]>([]);
  const terminalSending = useRef(false);
  const auth = query.data;
  const interaction = auth?.interaction;
  const active =
    auth?.phase === "starting" || auth?.phase === "waiting" || auth?.phase === "verifying";
  const signedIn =
    provider.auth.status === "authenticated" ||
    (provider.auth.status === "unknown" && auth?.phase === "succeeded");
  const isDiscovering =
    provider.driver === "acpRegistry" &&
    !active &&
    !signedIn &&
    !query.error &&
    auth?.methods === undefined;
  const needsExternalSetup =
    !active &&
    !signedIn &&
    (provider.setup?.canAuthenticate === false ||
      (provider.driver === "acpRegistry" && auth?.methods?.length === 0));
  const usesCredentials =
    provider.driver === "antigravity" &&
    (provider.auth.type === "gemini-api-key" || provider.auth.type === "agent-platform");
  const accountDescription = active
    ? auth?.phase === "starting"
      ? (auth.message ?? (usesCredentials ? "正在连接…" : "开始登录…"))
      : auth?.phase === "verifying"
        ? usesCredentials
          ? "正在检查证书和加载模型…"
          : "正在检查您的账户…"
        : interaction?.type === "terminal"
          ? "在下面的终点站完全注册"
          : interaction?.type === "credentials"
            ? "在下面输入您的证书。"
            : "在浏览器中完成登录。"
    : signedIn
      ? "签入。"
      : isDiscovering
        ? "发现登录方法…"
        : needsExternalSetup
          ? "没有在应用中登入的广告。 跟着代理提供方的文档完成设置。"
          : usesCredentials
            ? `连接到${environmentLabel} 来装入模型。`
            : `签名于${environmentLabel}。`;
  const statusMessage = auth?.phase === "failed" ? auth.message : null;
  const disabled = readOnly || pending || query.error !== null || isDiscovering;
  const draftId = `${auth?.flowId ?? ""}:${interaction?.id ?? ""}`;
  const values = draft.id === draftId ? draft.values : {};
  const url =
    interaction?.type === "browser" || interaction?.type === "deviceCode"
      ? interaction.url
      : auth?.authorizationUrl;

  async function run(command: () => Promise<AtomCommandResult<unknown, unknown>>) {
    if (pendingRef.current) return false;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    let succeeded = false;
    try {
      const result = await command();
      if (result._tag === "Success") succeeded = true;
      else if (!isAtomCommandInterrupted(result)) {
        const failure = squashAtomCommandFailure(result);
        setError(failure instanceof Error ? failure.message : "提供方登录失败，请再试一次。");
      }
    } catch {
      setError("提供方登录失败，请再试一次。");
    }
    pendingRef.current = false;
    setPending(false);
    return succeeded;
  }

  async function send(response: ProviderAuthResponse) {
    if (!auth?.flowId || !interaction) return false;
    return run(() =>
      respond({
        environmentId,
        input: { instanceId, flowId: auth.flowId!, interactionId: interaction.id, response },
      }),
    );
  }

  async function openBrowser() {
    if (!url || readOnly) return;
    const requiresConsent = interaction?.type === "browser" && interaction.requiresConsent;
    // Reserve tabs before awaiting consent; browsers block later opens.
    const pending = requiresConsent && !window.desktopBridge ? window.open("", "_blank") : null;
    if (pending) pending.opener = null;
    try {
      if (requiresConsent && !(await send({ type: "browser", action: "accept" }))) {
        pending?.close();
        return;
      }
      if (pending) pending.location.href = url;
      else await ensureLocalApi().shell.openExternal(url);
      setError(null);
    } catch {
      pending?.close();
      setError("无法打开登录页面。 复制链接并在浏览器中打开。");
    }
  }

  function updateDraft(name: string, value: string) {
    setDraft({ id: draftId, values: { ...values, [name]: value } });
  }

  return (
    <SettingsRow
      title="账户"
      description={
        signedIn && !active && provider.auth.email?.trim() ? (
          <span>
            签名为{" "}
            <RedactedSensitiveText
              key={provider.auth.email}
              value={provider.auth.email}
              ariaLabel="切换账户电子邮件可见度"
              revealTooltip="Click to reveal email"
              hideTooltip="Click to hide email"
              className="max-w-full truncate"
            />
          </span>
        ) : (
          <span role="status">{accountDescription}</span>
        )
      }
      status={
        statusMessage ? (
          <p role="status" className="[overflow-wrap:anywhere]">
            {statusMessage}
          </p>
        ) : undefined
      }
      control={
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {!active && (auth?.methods?.length ?? 0) > 1 ? (
            <Select
              value={auth?.methods?.some((method) => method.id === methodId) ? methodId : ""}
              disabled={disabled}
              onValueChange={(value) => setMethodId(value ?? "")}
            >
              <SelectTrigger size="sm" aria-label="登录方法" className="w-44">
                <SelectValue>
                  {auth?.methods?.find((method) => method.id === methodId)?.name ?? "提供者默认"}
                </SelectValue>
              </SelectTrigger>
              <SelectPopup>
                <SelectItem value="">提供者默认</SelectItem>
                {auth?.methods?.map((method) => (
                  <SelectItem key={method.id} value={method.id}>
                    {method.name}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          ) : null}
          {url ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => void openBrowser()}
              >
                打开浏览器
              </Button>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label="复制登录链接"
                      size="icon-sm"
                      variant="ghost-muted"
                      disabled={disabled}
                      onClick={() => {
                        // Copy during the click to retain clipboard activation; consent must still be
                        // recorded before use.
                        const copied = writeTextToClipboard(url, "Provider sign-in link");
                        void (async () => {
                          await copied;
                          if (interaction?.type === "browser" && interaction.requiresConsent)
                            await send({ type: "browser", action: "accept" });
                        })().catch(() => setError("无法复制登录链接。"));
                      }}
                    >
                      <CopyIcon />
                    </Button>
                  }
                />
                <TooltipPopup>复制登录链接</TooltipPopup>
              </Tooltip>
            </>
          ) : null}
          <>
            {needsExternalSetup && provider.setup?.documentationUrl ? (
              <Button
                size="sm"
                variant="outline"
                render={
                  <a href={provider.setup.documentationUrl} target="_blank" rel="noreferrer" />
                }
              >
                打开文档
              </Button>
            ) : active && auth?.flowId ? (
              <Button
                size="sm"
                variant="ghost-muted"
                aria-label="取消登录"
                disabled={disabled}
                onClick={() =>
                  void run(() =>
                    cancel({ environmentId, input: { instanceId, flowId: auth.flowId! } }),
                  )
                }
              >
                取消
              </Button>
            ) : !active && !needsExternalSetup && provider.setup?.canAuthenticate !== false ? (
              <Button
                size="sm"
                variant="outline"
                disabled={disabled || !provider.enabled || !provider.installed || !auth}
                onClick={() =>
                  void run(() =>
                    start({
                      environmentId,
                      input: {
                        instanceId,
                        ...(methodId && auth?.methods?.some((method) => method.id === methodId)
                          ? { methodId }
                          : {}),
                      },
                    }),
                  )
                }
              >
                {signedIn
                  ? "更改账户"
                  : auth?.phase === "failed" || auth?.phase === "cancelled"
                    ? usesCredentials
                      ? "重试连接"
                      : "重试登录"
                    : usesCredentials
                      ? "连接"
                      : "登录"}
              </Button>
            ) : null}
            {!active && signedIn && (provider.auth.canLogout ?? provider.setup?.canAuthenticate) ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled || !auth}
                onClick={() => {
                  void ensureLocalApi()
                    .dialogs.confirm(
                      `Sign out of ${provider.displayName ?? provider.driver} on ${environmentLabel}? This stops running threads that share this sign-in. Thread history is kept.`,
                    )
                    .then((confirmed) => {
                      if (confirmed) void run(() => logout(target));
                    });
                }}
              >
                退出登录
              </Button>
            ) : null}
          </>
        </div>
      }
    >
      {interaction?.type === "terminal" ||
      interaction?.type === "credentials" ||
      interaction?.type === "deviceCode" ||
      (url && (interaction?.type === "browser" ? interaction.acceptsCallback : !interaction)) ||
      error ||
      query.error ? (
        <>
          {interaction?.type === "deviceCode" ? (
            <p className="py-2 text-sm text-muted-foreground">
              输入代码{" "}
              <code className="select-all font-mono text-foreground">{interaction.userCode}</code>{" "}
              在您的浏览器中。
            </p>
          ) : null}
          {interaction?.type === "terminal" ? (
            <div className="py-2">
              <Suspense
                fallback={<p className="text-xs text-muted-foreground">正在装入登录终端…</p>}
              >
                <ProviderAuthTerminal
                  key={`${auth?.flowId}:${interaction.id}`}
                  output={interaction.output}
                  outputOffset={interaction.outputOffset}
                  onResponse={(response) => {
                    if (readOnly || !auth?.flowId) return;
                    for (
                      let offset = 0;
                      offset < Math.max(1, response.data.length);
                      offset += 4_096
                    ) {
                      terminalQueue.current.push({
                        instanceId,
                        flowId: auth.flowId,
                        interactionId: interaction.id,
                        response: {
                          ...response,
                          data: response.data.slice(offset, offset + 4_096),
                        },
                      });
                    }
                    if (terminalSending.current) return;
                    terminalSending.current = true;
                    void (async () => {
                      while (terminalQueue.current.length > 0) {
                        const input = terminalQueue.current.shift()!;
                        const result = await respond({ environmentId, input });
                        if (result._tag !== "Success") {
                          terminalQueue.current = [];
                          if (!isAtomCommandInterrupted(result))
                            setError("代理提供方的登录终端已无法使用。");
                          break;
                        }
                      }
                    })()
                      .catch(() => {
                        terminalQueue.current = [];
                        setError("无法将输入发送到服务商的登录终端。");
                      })
                      .finally(() => {
                        terminalSending.current = false;
                      });
                  }}
                />
              </Suspense>
            </div>
          ) : null}
          {interaction?.type === "credentials" ? (
            <form
              className="grid gap-2 py-2 text-sm leading-normal"
              onSubmit={(event) => {
                event.preventDefault();
                void send({ type: "credentials", values }).then((sent) => {
                  if (sent) setDraft({ id: "", values: {} });
                });
              }}
            >
              {interaction.fields.map((field) => (
                <label key={field.name} className="grid gap-1">
                  {field.label}
                  <Input
                    size="sm"
                    type={field.secret ? "password" : "text"}
                    autoComplete="off"
                    value={values[field.name] ?? ""}
                    disabled={disabled}
                    maxLength={16_384}
                    onChange={(event) => updateDraft(field.name, event.target.value)}
                  />
                </label>
              ))}
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="w-fit"
                disabled={disabled}
              >
                连接
              </Button>
            </form>
          ) : null}
          {url && (interaction?.type === "browser" ? interaction.acceptsCallback : !interaction) ? (
            <form
              className="grid gap-2 py-2 text-sm leading-normal"
              onSubmit={(event) => {
                event.preventDefault();
                if (!auth?.flowId || !values.callback?.trim()) return;
                void run(() =>
                  complete({
                    environmentId,
                    input: { instanceId, flowId: auth.flowId!, callbackUrl: values.callback! },
                  }),
                ).then((sent) => {
                  if (sent) setDraft({ id: "", values: {} });
                });
              }}
            >
              <label className="grid gap-1">
                如果最后的本地主机页面没有加载，请粘贴其完整URL here。
                <Input
                  size="sm"
                  id={`provider-callback-${instanceId}`}
                  type="url"
                  autoComplete="off"
                  value={values.callback ?? ""}
                  disabled={disabled}
                  maxLength={16_384}
                  onChange={(event) => updateDraft("callback", event.target.value)}
                />
              </label>
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="w-fit"
                disabled={disabled || !values.callback?.trim()}
              >
                继续
              </Button>
            </form>
          ) : null}
          {error || query.error ? (
            <p role="alert" className="py-2 text-xs text-destructive">
              {error ?? query.error}
            </p>
          ) : null}
        </>
      ) : null}
    </SettingsRow>
  );
}
