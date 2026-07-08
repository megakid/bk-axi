export function buildScope(flags: { pipeline?: string; limit?: string }): string {
  const parts: string[] = [];
  if (flags.pipeline) {
    parts.push(`--pipeline ${flags.pipeline}`);
  }
  if (flags.limit) {
    parts.push(`--limit ${flags.limit}`);
  }
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

export function maybeMoreHint(
  command: string,
  shown: number,
  limit: number,
  scope = "",
): string[] {
  if (shown < limit) {
    return [];
  }
  return [`Run \`${command}${scope} --limit <n>\` to request more than ${limit} rows`];
}
