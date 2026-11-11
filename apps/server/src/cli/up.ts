import * as HostProcess from "@t3tools/shared/HostProcess";
import * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { Command, Flag, GlobalFlag, Prompt } from "effect/cli";
import * as CliError from "effect/cli/CliError";

import packageJson from "../../package.json" with { type: "json" };
import * as BootService from "../cloud/bootService.ts";
import { compareExactServiceVersions } from "../cloud/serviceProtocol.ts";
import * as ServerConfig from "../config.ts";
import * as ManagedLimits from "../policy/managedLimits.ts";
import * as ManagedPolicy from "../policy/ManagedPolicy.ts";
import { projectLocationFlags, resolveCliAuthConfig } from "./config.ts";
import { resolveHostCliCommand } from "./invocation.ts";
import * as CliService from "./service.ts";

/** How other devices reach this machine now. */
interface Setup {
  readonly service: BootService.BootServiceStatus;
  readonly lan: boolean;
  /** An installed service with no T3CODE_LAN keeps the old default: on. */
  readonly lanFromOldDefault: boolean;
  readonly host: string | undefined;
}

const readSetup = Effect.fn("cli.up.read_setup")(function* () {
  const { baseDir } = yield* ServerConfig.ServerConfig;
  const service = yield* (yield* BootService.BootService).status;
  const { entries } = yield* CliService.readServiceEnv(baseDir);
  // Parsed as the server parses it.
  const lan = yield* Config.Boolean("T3CODE_LAN")
    .pipe(Config.option)
    .parse(ConfigProvider.fromEnv({ env: entries }));
  // Another home's service doesn't read this home's service.env.
  const servesThisHome = service.installed && service.otherBaseDir === undefined;
  return {
    service,
    lan: Option.getOrElse(lan, () => servesThisHome),
    lanFromOldDefault: Option.isNone(lan) && servesThisHome,
    host: entries.T3CODE_HOST,
  } satisfies Setup;
});

const formatSetup = (setup: Setup) => {
  const { service } = setup;
  // This home's access settings reach no service, so only the service is shown.
  if (service.otherBaseDir !== undefined) {
    return [
      `  ${"Service".padEnd(15)}installed for another T3 home · ${service.otherBaseDir}`,
      "",
      `Pass \`${BootService.formatBootServiceBaseDirOption(service.otherBaseDir)}\` to manage it.`,
    ].join("\n");
  }
  const rows: ReadonlyArray<readonly [string, string]> = [
    [
      "Service",
      !service.supported
        ? "unavailable"
        : service.installed
          ? `installed · t3@${service.installedVersion ?? packageJson.version}`
          : "not installed",
    ],
    [
      "Local network",
      setup.host !== undefined
        ? `overridden · T3CODE_HOST=${setup.host}`
        : setup.lanFromOldDefault
          ? "on · kept from an older install"
          : setup.lan
            ? "on · pairing code only"
            : "off",
    ],
  ];
  const notes = [
    ...(setup.host === undefined && setup.lan
      ? ["Anyone on your LAN or tailnet can reach the port. A pairing code is the only lock."]
      : []),
    ...(setup.lanFromOldDefault
      ? ["Older installs keep LAN access on. Turn it off: `t3 up --no-lan`."]
      : []),
  ];
  return [
    ...rows.map(([label, value]) => `  ${label.padEnd(15)}${value}`),
    ...(notes.length === 0 ? [] : ["", ...notes]),
  ].join("\n");
};

const formatNextSteps = (lan: boolean, serviceInstalled: boolean, pairCommand: string) =>
  lan
    ? `运行 \`${pairCommand}\`，然后在另一台设备上输入配对码。`
    : serviceInstalled
      ? "远程访问已关闭。T3 Code 仍在此设备后台运行。"
      : "远程访问已关闭。运行 `t3` 在此设备上使用 T3 Code。";

const interactiveTerminal = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

const setUp = Effect.fn("cli.up")(function* (flags: {
  readonly baseDir: Option.Option<string>;
  readonly lan: Option.Option<boolean>;
  readonly yes: boolean;
}) {
  const { baseDir } = yield* ServerConfig.ServerConfig;
  const service = yield* BootService.BootService;
  const baseDirArgs = Option.match(flags.baseDir, {
    onNone: () => [],
    onSome: (dir) => ["--base-dir", dir],
  });
  const { command: pairCommand } = yield* resolveHostCliCommand("pair", baseDirArgs);
  const before = yield* readSetup();
  // Before any question or write: install would refuse only after both.
  if (before.service.otherBaseDir !== undefined) {
    return yield* new BootService.BootServiceOtherBaseDirError({
      installedBaseDir: before.service.otherBaseDir,
      baseDir,
    });
  }
  const interactive = !flags.yes && interactiveTerminal();
  let lan = Option.getOrElse(flags.lan, () => before.lan);
  if (Option.isNone(flags.lan) && interactive) {
    if (before.service.installed)
      yield* Console.log(`当前设置
${formatSetup(before)}
`);
    const enabled = yield* Prompt.run(
      Prompt.Confirm({ message: "允许局域网设备使用配对码连接？", initial: before.lan }),
    ).pipe(Effect.catchTags({ QuitError: () => Effect.succeed(null) }));
    if (enabled === null) return yield* Console.log("设置未修改。");
    lan = enabled;
  } else if (Option.isNone(flags.lan) && !flags.yes && !before.service.installed) {
    return yield* new CliError.UserError({
      cause: "routes",
      userMessage: "当前没有交互式终端。请使用 --lan 或 --no-lan，或用 --yes 接受默认设置。",
    });
  }
  if (lan && !before.lan) {
    const policy = yield* ManagedPolicy.ManagedPolicy;
    if (!ManagedLimits.allowsRemoteClients(policy)) {
      return yield* ManagedLimits.refuseRemoteClients(policy);
    }
  }
  if (!before.service.installed && !lan) {
    if (before.lan) yield* CliService.writeServiceEnv(baseDir, { T3CODE_LAN: "false" });
    return yield* Console.log(formatNextSteps(false, false, pairCommand));
  }
  const { installedVersion } = before.service;
  const newer =
    installedVersion !== undefined &&
    compareExactServiceVersions(installedVersion, packageJson.version) > 0;
  // Asked before anything changes, so a declined restart leaves service.env
  // matching what the running service read when it started.
  // A stopped service of this version is not current, so reconcile starts it;
  // a newer one is left alone and needs this restart to start.
  const stopped = before.service.problems?.includes("service-stopped") === true;
  const restart =
    before.service.installed &&
    (before.service.current || newer) &&
    (lan !== before.lan || stopped);
  // An older or broken service is reinstalled, which restarts it too.
  const update = before.service.installed && !before.service.current && !newer && !stopped;
  if ((restart || update) && interactive && !stopped) {
    const confirmed = yield* Prompt.run(
      Prompt.Confirm({
        message: update
          ? "Update and restart T3 Code? Running agent turns will stop."
          : "Apply changes and restart? Running agent turns will stop.",
        initial: true,
      }),
    ).pipe(Effect.catchTags({ QuitError: () => Effect.succeed(false) }));
    if (!confirmed) return yield* Console.log("Nothing changed.");
  }

  const previousLan = (yield* CliService.readServiceEnv(baseDir)).entries.T3CODE_LAN;
  // Also with no service manager: the file records the choice that `t3 status` shows.
  yield* CliService.writeServiceEnv(baseDir, { T3CODE_LAN: String(lan) });
  // When the service step fails, an installed service still runs with the old
  // value, so the file goes back to match it.
  const restoreServiceEnv = before.service.installed
    ? CliService.writeServiceEnv(baseDir, { T3CODE_LAN: previousLan })
    : Effect.void;
  // A failed update or restart may still have started the service with the new
  // settings, so restart it once more on the old ones.
  const rollBack = before.service.installed
    ? restoreServiceEnv.pipe(Effect.andThen(service.restart.pipe(Effect.ignore)))
    : Effect.void;
  if (before.host !== undefined) {
    yield* Console.warn(
      `T3CODE_HOST=${before.host} in service.env overrides the network choice. Remove it to apply it.`,
    );
  }

  const printServeCommand = Effect.fn(function* (reason: string) {
    const { command } = yield* resolveHostCliCommand("serve", [
      ...baseDirArgs,
      // Explicit either way, so a T3CODE_LAN in the shell cannot override the choice.
      lan ? "--lan" : "--no-lan",
    ]);
    yield* Console.log(`${reason} Keep this command running:\n  ${command}`);
    // A host wins over --lan and --no-lan, as it does in service.env.
    const shellHost = (yield* HostProcess.Environment).T3CODE_HOST;
    if (shellHost !== undefined) {
      yield* Console.warn(
        `T3CODE_HOST=${shellHost} in this shell overrides that choice. Unset it before you run the command.`,
      );
    }
  });
  if (!before.service.supported) {
    yield* printServeCommand("Background service unavailable.");
  } else {
    if (newer) {
      yield* Console.log(`Keeping installed service version t3@${installedVersion}.`);
    }
    if (update && !interactive) {
      yield* Console.log("Updating T3 Code. Running agent turns will stop.");
    }
    const result = newer
      ? ({ changed: false } as const)
      : yield* CliService.reconcileService().pipe(
          Effect.catchTags({
            BootServicePrerequisiteError: (error) => Effect.succeed({ failed: error.message }),
            BootServiceUnsupportedError: (error) => Effect.succeed({ failed: error.message }),
          }),
          Effect.tapError(() => rollBack),
        );
    if ("failed" in result && before.service.installed) {
      // The old service still runs, so a foreground server would clash with it.
      yield* restoreServiceEnv;
      const { command } = yield* resolveHostCliCommand("up", baseDirArgs);
      yield* Console.log(
        `Service setup failed: ${result.failed} Fix that, then run \`${command}\` again.`,
      );
    } else if ("failed" in result) {
      yield* printServeCommand(`Service setup failed: ${result.failed}`);
    } else if (result.changed) {
      yield* Console.log(CliService.formatServiceChange(result));
    } else if (restart) {
      if (!interactive && !stopped) {
        yield* Console.log("正在重启 T3 Code。运行中的代理任务将停止。");
      }
      const outcome = yield* service.restart.pipe(Effect.tapError(() => rollBack));
      if (outcome === "queued") yield* Console.log("已安排重启，当前会话将断开。");
      if (outcome === "skipped") {
        yield* Console.log("服务未重启。运行 `t3 service status` 查看原因。");
      }
    }
  }

  const after = yield* readSetup();
  yield* Console.log(
    // From what took effect: a failed service step can undo a choice.
    `\nThis machine\n${formatSetup(after)}\n\n${formatNextSteps(
      after.lan,
      after.service.installed,
      pairCommand,
    )}`,
  );
});

export const upCommand = Command.make("up", {
  ...projectLocationFlags,
  lan: Flag.Boolean("lan").pipe(
    Flag.withDescription(
      "Allow LAN and tailnet connections. Anyone there can reach the port; a pairing code is the only lock. Turn off with --no-lan.",
    ),
    Flag.optional,
  ),
  yes: Flag.Boolean("yes").pipe(
    Flag.withDescription("跳过确认并使用现有设置。重启会停止运行中的代理任务。"),
    Flag.withDefault(false),
  ),
}).pipe(
  Command.withShortDescription("Set up remote access and the T3 Code background service."),
  Command.withDescription(
    "Set up remote access and the T3 Code background service. Access flags skip the question, and routes not named keep their settings. Without a terminal, a needed restart runs without asking and stops running agent turns.",
  ),
  Command.withExamples([
    { command: "t3 up", description: "Choose remote access." },
    { command: "t3 up --lan", description: "Allow LAN access with pairing codes." },
    { command: "t3 up --no-lan", description: "Stop LAN access." },
    { command: "t3 up --yes", description: "Take the defaults with no questions." },
    { command: "t3 status --json", description: "Read the settings from a script." },
  ]),
  Command.withHandler(
    Effect.fn("cli.up.run")(function* (flags) {
      const config = yield* resolveCliAuthConfig(flags, yield* GlobalFlag.LogLevel, {
        quietLogs: true,
      });
      return yield* setUp(flags).pipe(
        Effect.provide(
          Layer.merge(CliService.layer(config), ManagedPolicy.layer).pipe(
            Layer.provideMerge(ServerConfig.layer(config)),
          ),
        ),
      );
    }),
  ),
);

/** `t3 status --json`, for scripts and agents. */
const setupJson = (setup: Setup) =>
  JSON.stringify(
    {
      service: {
        supported: setup.service.supported,
        installed: setup.service.installed,
        installedVersion: setup.service.installedVersion ?? null,
        otherBaseDir: setup.service.otherBaseDir ?? null,
      },
      lan: {
        enabled: setup.lan,
        inheritedDefault: setup.lanFromOldDefault,
        hostOverride: setup.host ?? null,
      },
    },
    null,
    2,
  );

export const statusCommand = Command.make("status", {
  ...projectLocationFlags,
  json: Flag.Boolean("json").pipe(
    Flag.withDescription("Print the settings as JSON. Does not test connections."),
    Flag.withDefault(false),
  ),
}).pipe(
  Command.withDescription("Show service setup and remote access settings."),
  Command.withExamples([
    { command: "t3 status", description: "Show the settings." },
    { command: "t3 status --json", description: "Print them for scripts and agents." },
  ]),
  Command.withHandler(
    Effect.fn("cli.status")(function* (flags) {
      const config = yield* resolveCliAuthConfig(flags, yield* GlobalFlag.LogLevel, {
        quietLogs: flags.json,
      });
      const setup = yield* readSetup().pipe(
        Effect.provide(Layer.merge(CliService.layer(config), ServerConfig.layer(config))),
      );
      yield* Console.log(
        flags.json
          ? setupJson(setup)
          : setup.service.otherBaseDir !== undefined
            ? `This machine\n${formatSetup(setup)}`
            : `This machine\n${formatSetup(setup)}\n\nChange access: \`t3 up\`.`,
      );
    }),
  ),
);
