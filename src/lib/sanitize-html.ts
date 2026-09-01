const ALLOWED = /^(b|strong|i|em|u|s|br|p|ul|ol|li|h1|h2|h3|h4|span|div|a|small|big)$/i;

/** Very small allowlist sanitizer for staff-authored notification HTML. */
export function sanitizeRichHtml(html: string): string {
  return html
    // drop dangerous elements entirely
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>/gi, "")
    // strip event handlers and javascript: urls
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "")
    // remove any tag that isn't on the allowlist
    .replace(/<\s*\/?\s*([a-zA-Z0-9]+)([^>]*)>/g, (match, tag: string) =>
      ALLOWED.test(tag) ? match : "",
    );
}
