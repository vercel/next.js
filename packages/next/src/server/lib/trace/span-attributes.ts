import type {
  AttributeValue,
  SpanOptions,
  SpanStatusCode,
} from 'next/dist/compiled/@opentelemetry/api'
import type { SpanStoreAttributes, SpanStoreLink } from './span-store'
import type { OpenTelemetryReadableSpan } from './request-insights-otel'

// The OTel status code is part of its public API. Keep recording independent of
// loading the runtime API.
export const SPAN_STATUS_ERROR: SpanStatusCode = 2

export function cleanSpanStoreAttributes(
  attributes:
    | Record<string, AttributeValue | undefined>
    | SpanStoreAttributes
    | undefined,
  cleanedAttributes: SpanStoreAttributes = {}
): SpanStoreAttributes {
  if (attributes) {
    for (const key of Object.keys(attributes)) {
      const value = attributes[key]
      if (value !== undefined) {
        cleanedAttributes[key] = value
      }
    }
  }
  return cleanedAttributes
}

export function getSpanStoreLinks(
  links: SpanOptions['links'] | OpenTelemetryReadableSpan['links'] | undefined
): SpanStoreLink[] | undefined {
  const spanStoreLinks = links?.map((link) => ({
    traceId: link.context.traceId,
    spanId: link.context.spanId,
    attributes: cleanSpanStoreAttributes(link.attributes),
  }))

  return spanStoreLinks?.length ? spanStoreLinks : undefined
}

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
