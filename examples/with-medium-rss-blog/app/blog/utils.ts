// Formats an ISO date string as `Mon DD, YYYY`. Stable across server and
// client by hardcoding the locale and timezone so the rendered HTML matches
// what the browser would otherwise produce locally.
export function formatDate(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}