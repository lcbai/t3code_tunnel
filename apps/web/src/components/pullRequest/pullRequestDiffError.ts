/** Diff failures currently include transport wrappers, so recognize the reason inside them. */
export function describePullRequestDiffError(error: string, providerName: string, term: string) {
  if (/\brate limit\b|\brate[-_]limited\b|\btoo many requests\b/i.test(error)) {
    return {
      title: `${providerName} 请求达到频率上限`,
      description: `${providerName} 暂时限制了请求。请稍后重试，或前往 ${providerName} 查看更改。`,
    };
  }

  return {
    title: "无法加载更改",
    description: `环境无法加载此${term}的差异。请重试，或前往 ${providerName} 查看更改。`,
  };
}
