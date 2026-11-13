import type { AttributeValue } from '@opentelemetry/api'

export function normalizeTraceAttributes(
  attributes: Record<string, unknown> | undefined,
  preserveArrays = false
): Record<string, AttributeValue> {
  // Legacy trace tags may contain values outside the OTel attribute contract.
  const entries: [string, AttributeValue][] = []
  for (const key of Object.keys(attributes ?? {})) {
    try {
      const value = attributes![key]
      if (value === null || value === undefined) continue
      if (
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean' ||
        (preserveArrays && Array.isArray(value))
      ) {
        entries.push([key, value])
      } else {
        const encoded = JSON.stringify(value)
        if (encoded !== undefined) entries.push([key, encoded])
      }
    } catch {
      // Diagnostics must not interrupt the work being measured. Cyclic values,
      // bigint payloads and throwing serializers cannot become OTel attributes.
    }
  }
  return Object.fromEntries(entries)
}
