import {
  managedRuntimeModeDenial,
  type ManagedPolicySummary,
  type RuntimeMode,
} from "@t3tools/contracts";

export const RUNTIME_MODE_CHOICES: ReadonlyArray<{
  readonly mode: RuntimeMode;
  readonly label: string;
  readonly description: string;
}> = [
  {
    mode: "approval-required",
    label: "受监督",
    description: "运行命令和修改文件前询问。",
  },
  {
    mode: "auto-accept-edits",
    label: "自动接受编辑",
    description: "自动批准编辑，执行其他操作前询问。",
  },
  {
    mode: "auto",
    label: "自动",
    description: "支持此模式的提供方会自动批准常规操作，其他提供方仍会询问。",
  },
  {
    mode: "full-access",
    label: "完整访问权限",
    description: "允许运行命令和编辑文件，无需确认。",
  },
];

export function runtimeModeChoicesForSupportedModes(
  supportedRuntimeModes: ReadonlyArray<RuntimeMode> | undefined,
) {
  return supportedRuntimeModes && supportedRuntimeModes.length > 0
    ? RUNTIME_MODE_CHOICES.filter((choice) => supportedRuntimeModes.includes(choice.mode))
    : RUNTIME_MODE_CHOICES;
}

export type RuntimeModeChoice = (typeof RUNTIME_MODE_CHOICES)[number] & {
  /** Set when a target environment's managed policy caps runtime modes below this one. */
  readonly disabledReason?: string;
};

/**
 * Marks modes above a managed runtime ceiling. A control acting on several environments is
 * managed when any of them is, so the first target that refuses a mode supplies its reason.
 */
export function withManagedRuntimeModeLimits(
  choices: ReadonlyArray<RuntimeModeChoice>,
  policies: ReadonlyArray<ManagedPolicySummary | undefined>,
): ReadonlyArray<RuntimeModeChoice> {
  return choices.map((choice) => {
    const reason = policies
      .map((policy) => managedRuntimeModeDenial(policy, choice.mode))
      .find((denial) => denial !== undefined);
    return reason === undefined ? choice : { ...choice, disabledReason: reason };
  });
}

/**
 * A new thread's mode: the draft's choice unless the managed ceiling refuses it, then the
 * default, which the server already reads back at or below the ceiling.
 */
export function resolveNewThreadRuntimeMode(
  draftMode: RuntimeMode | undefined,
  defaultMode: RuntimeMode,
  policy: ManagedPolicySummary | undefined,
): RuntimeMode {
  return draftMode !== undefined && managedRuntimeModeDenial(policy, draftMode) === undefined
    ? draftMode
    : defaultMode;
}

export function compatibleRuntimeModeForChoices(
  runtimeMode: RuntimeMode,
  choices: ReadonlyArray<{ readonly mode: RuntimeMode }>,
): RuntimeMode {
  return choices.some((choice) => choice.mode === runtimeMode)
    ? runtimeMode
    : (choices[0]?.mode ?? runtimeMode);
}

export { selectableProviderOptionChoices as selectableChoices } from "@t3tools/client-runtime/model-traits";
