import type { ChangeRequestTerminology } from "@t3tools/client-runtime/source-control-clients";

export function offHeadPullRequestCheckoutToast(terminology: ChangeRequestTerminology) {
  return {
    type: "warning",
    title: "已经检查过，但还没有证实最近的犯罪",
    description: `无法在${terminology.singular} 最新承诺中确认退出，因此其代码可能有所不同。 本地承诺或未承诺的工作将保留退出所在位置。`,
  } as const;
}
