import type { PullRequestInvolvement, PullRequestListState } from "@t3tools/contracts";
import {
  CalendarArrowDownIcon,
  CalendarArrowUpIcon,
  ClockIcon,
  EyeIcon,
  LayersIcon,
  ListChecksIcon,
  Maximize2Icon,
  Minimize2Icon,
  PenLineIcon,
  UserLockIcon,
} from "lucide-react";

import type { PullRequestFilterOption } from "./PullRequestListFilters";
import type { PullRequestListSort } from "./pullRequestListPreferences";
import { PullRequestGlyph } from "./pullRequestIcons";

export const INVOLVEMENT_TABS = [
  { value: "all", label: "全部人员", Icon: LayersIcon },
  { value: "reviewing", label: "审查", Icon: EyeIcon },
  { value: "authored", label: "已撰写", Icon: PenLineIcon },
] as const satisfies ReadonlyArray<PullRequestFilterOption<PullRequestInvolvement>>;

export const STATE_TABS = [
  { value: "all", label: "全部人员", Icon: LayersIcon },
  { value: "open", label: "打开", Icon: PullRequestGlyph.pullRequest },
  { value: "closed", label: "关闭", Icon: PullRequestGlyph.closed },
  { value: "merged", label: "合并", Icon: PullRequestGlyph.merged },
] as const satisfies ReadonlyArray<PullRequestFilterOption<PullRequestListState>>;

export const SORT_OPTIONS = [
  { value: "ready", label: "合并准备", Icon: ListChecksIcon },
  { value: "blocked", label: "挡着我", Icon: UserLockIcon },
  { value: "updated", label: "最近更新", Icon: ClockIcon },
  { value: "newest", label: "显示的最新", Icon: CalendarArrowDownIcon },
  { value: "oldest", label: "最老的显示", Icon: CalendarArrowUpIcon },
  { value: "largest", label: "显示的最大", Icon: Maximize2Icon },
  { value: "smallest", label: "显示最小", Icon: Minimize2Icon },
] as const satisfies ReadonlyArray<PullRequestFilterOption<PullRequestListSort>>;
