import {
  BearerConnectionTarget,
  PrimaryConnectionTarget,
  type PreparedConnection,
} from "@t3tools/client-runtime/connection";
import {
  EnvironmentId,
  type EnvironmentSpeechModel,
  type EnvironmentSpeechStatus,
} from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { __setClientSettingsForTests, getClientSettings } from "../../hooks/useSettings";
import {
  useEnvironmentSpeechInput,
  useVoiceTranscriptionDestination,
} from "../../speech/useEnvironmentSpeechInput";
import { chooseAudioDestination, chooseTranscriptCleanup } from "../../speech/voiceConsent";
import { useEnvironmentScope } from "../../state/session";
import { toastManager } from "../ui/toast";
import { SettingsScopeProvider } from "./SettingsScopeContext";
import { SpeechLanguageSelect } from "./SpeechLanguageSelect";
import { VoiceSettingsPanel } from "./VoiceSettingsPanel";

vi.mock(import("../../speech/useEnvironmentSpeechInput"), { spy: true });
vi.mock(import("../../state/session"), { spy: true });

vi.mock("../../connection/runtime", async () => {
  const [rpc, { Atom }] = await Promise.all([
    import("@t3tools/client-runtime/rpc"),
    import("effect/reactivity"),
  ]);
  return {
    connectionAtomRuntime: Atom.runtime(
      rpc.layerRemoteHttpClient((input, init) => globalThis.fetch(input, init)),
    ),
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

it.each([{ cpu: null, accelerated: 2.1 }, { cpu: 5, accelerated: null }, { accelerated: 2.1 }])(
  "uses the destination environment's benchmark tier across switches with measurements %j",
  async (secondsPer30s) => {
    const target = new PrimaryConnectionTarget({
      environmentId: EnvironmentId.make("voice-local"),
      label: "Local CPU",
      httpBaseUrl: window.location.origin,
      wsBaseUrl: "ws://localhost",
    });
    const local: PreparedConnection = {
      ...target,
      target,
      socketUrl: target.wsBaseUrl,
      httpAuthorization: null,
    };
    const remote: PreparedConnection = {
      environmentId: EnvironmentId.make("voice-remote"),
      label: "Remote GPU",
      httpBaseUrl: "https://voice.example.test",
      socketUrl: "wss://voice.example.test/ws",
      httpAuthorization: { _tag: "Bearer", token: "test-token" },
      target: new BearerConnectionTarget({
        environmentId: EnvironmentId.make("voice-remote"),
        label: "Remote GPU",
        connectionId: "remote",
      }),
    };
    let prepared = local;
    const remoteStatus = deferred<Response>();
    const remoteRequested = deferred<void>();
    const status = {
      supported: true,
      state: "ready",
      modelId: "both",
      model: "Bilingual",
      size: 100,
      supportsStreaming: false,
      supportsTranslation: false,
      acceleration: "auto",
      modelUnloadTimeout: "never",
      gpuDevices: [],
      benchmarkTier: "cpu",
    } satisfies EnvironmentSpeechStatus;
    const model: EnvironmentSpeechModel = {
      id: "both",
      name: "Bilingual",
      description: "",
      size: 100,
      languages: ["en"],
      accuracy: 1,
      speed: 1,
      recommended: true,
      supportsStreaming: false,
      supportsTranslation: false,
      supportsLanguageDetection: false,
      active: false,
      state: "downloadable",
      benchmark: {
        accuracy: { en: { grade: "A-", errorPercent: 4 } },
        secondsPer30s,
      },
    };
    const cpuBenchmark = `速度：${secondsPer30s.cpu === undefined ? "更新服务器" : secondsPer30s.cpu === null ? "未测试" : `${secondsPer30s.cpu} 秒 / 30 秒`}`;
    const gpuBenchmark = `速度：${secondsPer30s.accelerated === null ? "未测试" : `${secondsPer30s.accelerated} 秒 / 30 秒`}`;
    const fetch = globalThis.fetch;
    using _network = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = new URL(input instanceof Request ? input.url : input, window.location.href);
      if (url.pathname === "/api/voice/status") {
        if (url.origin === remote.httpBaseUrl) {
          remoteRequested.resolve();
          return remoteStatus.promise;
        }
        return Promise.resolve(Response.json(status));
      }
      if (url.pathname === "/api/voice/models")
        return Promise.resolve(Response.json({ models: [model] }));
      return fetch(input, init);
    });
    await vi.mocked(useVoiceTranscriptionDestination).withImplementation(
      () => ({
        environmentId: prepared.environmentId,
        label: prepared.label,
        grantId: "test",
        prepared,
      }),
      async () => {
        const panel = () => (
          <SettingsScopeProvider search={{}} onChange={() => {}}>
            <VoiceSettingsPanel />
          </SettingsScopeProvider>
        );
        await using screen = await render(panel());
        await expect.element(screen.getByText(cpuBenchmark)).toBeVisible();
        prepared = remote;
        await screen.rerender(panel());
        await remoteRequested.promise;
        await expect.element(screen.getByText(cpuBenchmark)).not.toBeInTheDocument();
        remoteStatus.resolve(
          Response.json({
            ...status,
            benchmarkTier: "accelerated",
            gpuDevices: [{ id: "gpu", name: "Remote GPU" }],
          }),
        );
        await expect.element(screen.getByText(gpuBenchmark)).toBeVisible();
        prepared = local;
        await screen.rerender(panel());
        await expect.element(screen.getByText(cpuBenchmark)).toBeVisible();
        await expect.element(screen.getByText(gpuBenchmark)).not.toBeInTheDocument();
      },
    );
  },
);

it("tests the selected model after download and preserves its transcript across filters", async () => {
  const target = new PrimaryConnectionTarget({
    environmentId: EnvironmentId.make("voice-filter"),
    label: "Test environment",
    httpBaseUrl: window.location.origin,
    wsBaseUrl: "ws://localhost",
  });
  const prepared = { ...target, target, socketUrl: target.wsBaseUrl, httpAuthorization: null };
  const model: EnvironmentSpeechModel = {
    id: "tiny",
    name: "Tiny",
    description: "",
    size: 100,
    languages: ["en"],
    accuracy: 1,
    speed: 1,
    recommended: false,
    supportsStreaming: false,
    supportsTranslation: false,
    supportsLanguageDetection: false,
    active: true,
    state: "installed",
  };
  const status = {
    supported: true,
    state: "ready",
    modelId: model.id,
    model: model.name,
    size: model.size,
    supportsStreaming: false,
    supportsTranslation: false,
    acceleration: "cpu",
    modelUnloadTimeout: "never",
    gpuDevices: [],
    benchmarkTier: "cpu",
  } satisfies EnvironmentSpeechStatus;
  let installed = false;
  const fetch = globalThis.fetch;
  using _network = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = new URL(input instanceof Request ? input.url : input, window.location.href);
    if (url.pathname === "/api/voice/status")
      return Promise.resolve(
        Response.json(installed ? status : { ...status, state: "missing-model" }),
      );
    if (url.pathname === "/api/voice/models/download") {
      installed = true;
      return Promise.resolve(Response.json({ models: [model] }));
    }
    if (url.pathname === "/api/voice/models")
      return Promise.resolve(
        Response.json({
          models: [
            installed ? model : { ...model, state: "downloadable", active: false },
            {
              ...model,
              id: "both",
              name: "Bilingual",
              active: false,
              languages: ["en", "fr"],
              ...(url.searchParams.has("benchmarks")
                ? {
                    benchmark: {
                      accuracy: {
                        en: { grade: "A-", errorPercent: 4 },
                        fr: { grade: "B+", errorPercent: 5.5 },
                      },
                      secondsPer30s: { cpu: 5, accelerated: 2.1 },
                    },
                  }
                : {}),
            },
          ],
        }),
      );
    return fetch(input, init);
  });
  const transcript = "Keep this transcript.";
  using _scope = vi.mocked(useEnvironmentScope).mockReturnValue(true);
  await vi.mocked(useVoiceTranscriptionDestination).withImplementation(
    () => ({ environmentId: target.environmentId, label: target.label, grantId: "test", prepared }),
    async () => {
      await vi.mocked(useEnvironmentSpeechInput).withImplementation(
        (input) => ({
          available: true,
          status,
          transcriptionEnvironmentId: target.environmentId,
          transcriptionEnvironmentLabel: target.label,
          setup: {
            open: false,
            step: 0,
            model: null,
            language: null,
            downloading: false,
            catalogFailed: false,
            retryCatalog: null,
            error: null,
            setOpen: () => {},
            download: async () => {},
            cancelDownload: async () => {},
            startRecording: async () => {},
          },
          state: { phase: "idle", error: null, errorAction: null },
          preview: null,
          level: 0,
          preparing: false,
          blocksSubmission: false,
          freezesEditor: false,
          start: async () => {
            input.commitDraft(transcript, { start: transcript.length, end: transcript.length });
          },
          submitAfterDictation: () => {},
          stop: async () => {},
          cancel: () => {},
          skipPostProcessing: () => {},
        }),
        async () => {
          await using screen = await render(
            <SettingsScopeProvider search={{}} onChange={() => {}}>
              <VoiceSettingsPanel />
            </SettingsScopeProvider>,
          );
          const testModel = screen.getByRole("button", { name: "测试模型", exact: true });
          const download = screen.getByRole("button", { name: "下载", exact: true });
          await expect.element(download).toBeVisible();
          expect(testModel.query()).toBeNull();
          expect(screen.getByRole("button", { name: "设置语音输入" }).query()).toBeNull();
          await userEvent.click(download);
          await expect.element(testModel).toBeVisible();
          expect(screen.getByRole("button", { name: "设置语音输入" }).query()).toBeNull();
          await userEvent.click(testModel);
          const result = screen.getByRole("status", { name: "测试记录" });
          await expect.element(result).toHaveTextContent(transcript);

          const search = screen.getByRole("textbox", { name: "搜索转写模型" });
          await userEvent.fill(search, "no matching model");
          await expect.element(screen.getByText("没有模型匹配。")).toBeVisible();
          await userEvent.clear(search);
          await userEvent.fill(screen.getByRole("textbox", { name: "搜索语言" }), "fr");
          const french = screen.getByRole("button", { name: "法语", exact: true });
          await userEvent.click(french);
          await expect.element(screen.getByText("Bilingual", { exact: true })).toBeVisible();
          await expect.element(screen.getByText("B+", { exact: true })).toBeVisible();
          expect(screen.container.querySelector("#transcription-test")).toHaveAttribute("hidden");
          await userEvent.click(french);
          await expect.element(result).toBeVisible();
          await vi.waitFor(() =>
            expect(screen.container.querySelector('[aria-label="测试记录"]')?.textContent).toBe(
              transcript,
            ),
          );
        },
      );
    },
  );
});

it("loads the models of a directly paired destination", async () => {
  const target = new BearerConnectionTarget({
    environmentId: EnvironmentId.make("voice-paired"),
    label: "MacBook Pro",
    connectionId: "voice-paired",
  });
  const prepared = {
    environmentId: target.environmentId,
    label: target.label,
    httpBaseUrl: window.location.origin,
    socketUrl: "ws://localhost",
    httpAuthorization: {
      _tag: "Bearer" as const,
      token: "paired-access-token",
    },
    target,
  };
  const model: EnvironmentSpeechModel = {
    id: "tiny",
    name: "Tiny",
    description: "",
    size: 100,
    languages: ["en"],
    accuracy: 1,
    speed: 1,
    recommended: false,
    supportsStreaming: false,
    supportsTranslation: false,
    supportsLanguageDetection: false,
    active: false,
    state: "downloadable",
  };
  const status = {
    supported: true,
    state: "missing-model",
    modelId: model.id,
    model: model.name,
    size: model.size,
    supportsStreaming: false,
    supportsTranslation: false,
    acceleration: "cpu",
    modelUnloadTimeout: "never",
    gpuDevices: [],
    benchmarkTier: "cpu",
  } satisfies EnvironmentSpeechStatus;
  const authorizations: Array<string | null> = [];
  const fetch = globalThis.fetch;
  using _network = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = new URL(input instanceof Request ? input.url : input, window.location.href);
    if (url.pathname === "/api/voice/status") {
      authorizations.push(new Headers(init?.headers).get("authorization"));
      return Promise.resolve(Response.json(status));
    }
    if (url.pathname === "/api/voice/models")
      return Promise.resolve(Response.json({ models: [model] }));
    return fetch(input, init);
  });
  using notify = vi.spyOn(toastManager, "add").mockReturnValue("test");
  // Restored even when an assertion fails, unlike `withImplementation`.
  using _destination = vi.mocked(useVoiceTranscriptionDestination).mockImplementation(() => ({
    environmentId: target.environmentId,
    label: target.label,
    grantId: "test",
    prepared,
  }));
  await using screen = await render(
    <SettingsScopeProvider search={{}} onChange={() => {}}>
      <VoiceSettingsPanel />
    </SettingsScopeProvider>,
  );
  await vi.waitFor(() => expect(authorizations.length + notify.mock.calls.length).not.toBe(0));
  expect(notify).not.toHaveBeenCalled();
  expect(authorizations).toEqual(["Bearer paired-access-token"]);
  await expect.element(screen.getByText("Tiny", { exact: true })).toBeVisible();
});

it("recovers from a failed download progress poll without notifying, but reports a failed initial load", async () => {
  const target = new PrimaryConnectionTarget({
    environmentId: EnvironmentId.make("voice-progress"),
    label: "Test environment",
    httpBaseUrl: window.location.origin,
    wsBaseUrl: "ws://localhost",
  });
  const prepared = { ...target, target, socketUrl: target.wsBaseUrl, httpAuthorization: null };
  const model: EnvironmentSpeechModel = {
    id: "tiny",
    name: "Tiny",
    description: "",
    size: 100,
    languages: ["en"],
    accuracy: 1,
    speed: 1,
    recommended: false,
    supportsStreaming: false,
    supportsTranslation: false,
    supportsLanguageDetection: false,
    active: false,
    state: "downloading",
  };
  const status = {
    supported: true,
    state: "missing-model",
    modelId: model.id,
    model: model.name,
    size: model.size,
    supportsStreaming: false,
    supportsTranslation: false,
    acceleration: "cpu",
    modelUnloadTimeout: "never",
    gpuDevices: [],
    benchmarkTier: "cpu",
  };
  const unavailable = () => new Response(null, { status: 503 });
  const readModels = vi
    .fn((_withBenchmarks: boolean) => unavailable())
    .mockImplementationOnce(() => Response.json({ models: [model] }))
    .mockImplementationOnce(unavailable)
    .mockImplementationOnce(() => Response.json({ models: [{ ...model, state: "installed" }] }));
  const fetch = globalThis.fetch;
  using _network = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
    const url = new URL(input instanceof Request ? input.url : input, window.location.href);
    if (url.pathname === "/api/voice/status") return Promise.resolve(Response.json(status));
    if (url.pathname === "/api/voice/models")
      return Promise.resolve(readModels(url.searchParams.has("benchmarks")));
    return fetch(input, init);
  });
  using notify = vi.spyOn(toastManager, "add").mockReturnValue("test");
  await vi.mocked(useVoiceTranscriptionDestination).withImplementation(
    () => ({ environmentId: target.environmentId, label: target.label, grantId: "test", prepared }),
    async () => {
      const panel = (key: string) => (
        <SettingsScopeProvider search={{}} onChange={() => {}}>
          <VoiceSettingsPanel key={key} />
        </SettingsScopeProvider>
      );
      await using screen = await render(panel("first"));
      await expect.element(screen.getByRole("button", { name: "使用模型" })).toBeVisible();
      expect(readModels.mock.calls.map(([withBenchmarks]) => withBenchmarks)).toEqual([
        true,
        false,
        false,
      ]);
      expect(notify).not.toHaveBeenCalled();
      await screen.rerender(panel("reopened"));
      await vi.waitFor(() =>
        expect(notify).toHaveBeenCalledWith(expect.objectContaining({ title: "无法加载转写模型" })),
      );
    },
  );
});

it.each([
  ["speech-models", "voice-transcription-destination"],
  ["speech-hardware", "voice-transcription-destination"],
  ["transcription-test", "voice-transcription-destination"],
  ["speech-correction-word", "speech-post-processing"],
  ["speech-post-processing-model", "speech-post-processing"],
])(
  "searching for disabled %s focuses its opt-in without enabling it",
  async (target, prerequisite) => {
    chooseAudioDestination(null);
    chooseTranscriptCleanup(false);
    await using screen = await render(
      <SettingsScopeProvider search={{}} onChange={() => {}}>
        <VoiceSettingsPanel />
      </SettingsScopeProvider>,
      { router: `/#${target}` },
    );
    await vi.waitFor(() => expect(document.activeElement?.id).toBe(prerequisite));
    await expect
      .element(screen.getByRole("combobox", { name: "转写为" }))
      .toHaveTextContent("关闭");
    await expect.element(screen.getByRole("switch", { name: "清理笔录" })).not.toBeChecked();
  },
);

it("keeps a missing destination selected without claiming it cannot transcribe", async () => {
  __setClientSettingsForTests(getClientSettings());
  using cleanup = new DisposableStack();
  cleanup.defer(() => chooseAudioDestination(null));
  chooseAudioDestination({ kind: "environment", environmentId: EnvironmentId.make("missing") });
  await using screen = await render(
    <SettingsScopeProvider search={{}} onChange={() => {}}>
      <VoiceSettingsPanel />
    </SettingsScopeProvider>,
  );
  await expect
    .element(screen.getByRole("combobox", { name: "转写为" }))
    .toHaveTextContent("所选环境不可用");
  await expect.element(screen.getByText(/无法在本地输入音频/)).not.toBeInTheDocument();
});

it("shows the model's effective language and restores the saved preference when supported again", async () => {
  const previous = getClientSettings();
  using cleanup = new DisposableStack();
  cleanup.defer(() => __setClientSettingsForTests(previous));
  __setClientSettingsForTests({ ...previous, speechLanguage: "fr" });
  await using screen = await render(<SpeechLanguageSelect model={{ languages: ["en"] }} />);
  const picker = screen.getByRole("combobox", { name: "转写语言" });
  await expect.element(picker).toHaveTextContent("英语（法语不可用）");
  await screen.rerender(
    <SpeechLanguageSelect model={{ languages: ["en", "de"], supportsLanguageDetection: true }} />,
  );
  await expect.element(picker).toHaveTextContent("自动检测（法语不可用）");
  await screen.rerender(<SpeechLanguageSelect model={{ languages: ["en", "fr"] }} />);
  await expect.element(picker).toHaveTextContent("法语");
  expect(getClientSettings().speechLanguage).toBe("fr");
});

it("keeps punctuation in a saved dictionary term and its alias", async () => {
  const previous = getClientSettings();
  using cleanup = new DisposableStack();
  cleanup.defer(() => __setClientSettingsForTests(previous));
  __setClientSettingsForTests({ ...previous, speechCustomWords: [] });
  await using screen = await render(
    <SettingsScopeProvider search={{}} onChange={() => {}}>
      <VoiceSettingsPanel />
    </SettingsScopeProvider>,
  );
  await userEvent.type(
    screen.getByRole("textbox", { name: "向 词典 添加单词或短语" }),
    "O'Reilly{Enter}",
  );
  expect(getClientSettings().speechCustomWords[0]?.term).toBe("O'Reilly");
  await userEvent.click(screen.getByRole("button", { name: "为 O'Reilly 添加别名" }));
  await userEvent.type(
    screen.getByRole("textbox", { name: "O'Reilly 的别名" }),
    '"Oh Really"{Enter}',
  );
  expect(getClientSettings().speechCustomWords).toEqual([
    { term: "O'Reilly", aliases: ['"Oh Really"'] },
  ]);
});
