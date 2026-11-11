export function compactComment(text: string): string {
  return text
    .replace(/\s*\([\w.-]+\.py#[\w-]+\)/g, '')
    .replace(/\s*\(occurr?ence\s+\d+\)/gi, '')
    .trimEnd();
}
