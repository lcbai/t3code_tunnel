import Constants from "expo-constants";
import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

interface AndroidAgentNotifications {
  showShowcaseActivity?(scheme: string, data: Record<string, string>): void;
}

const native =
  Platform.OS === "android"
    ? requireOptionalNativeModule<AndroidAgentNotifications>("T3AgentNotifications")
    : null;

function appScheme(): string {
  const scheme = Constants.expoConfig?.scheme;
  return (Array.isArray(scheme) ? scheme[0] : scheme) ?? "t3code";
}

export function showAndroidShowcaseAgentActivity(data: Record<string, string>): boolean {
  if (!native?.showShowcaseActivity) return false;
  native.showShowcaseActivity(appScheme(), data);
  return true;
}
