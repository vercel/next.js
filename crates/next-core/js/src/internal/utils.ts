/**
 * Converts an array of raw header entries to a map of header names to values.
 */
export function headersFromEntries(
  entries: Array<[string, string]>
): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = Object.create(null);
  for (const [key, value] of entries) {
    if (key in headers) {
      const prevValue = headers[key];
      if (typeof prevValue === "string") {
        headers[key] = [prevValue, value];
      } else {
        prevValue.push(value);
      }
    } else {
      headers[key] = value;
    }
  }
  return headers;
}
