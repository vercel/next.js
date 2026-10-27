/**
 * Prints OpenTelemetry spans as an indented tree, for snapshot tests of the
 * trace shape. Span IDs are left out, but trace identity is kept: every tree
 * root is labelled with its trace (the name of a known trace context, e.g.
 * `incoming` for the test's incoming `traceparent`, otherwise `A`, `B`, … in
 * order of appearance), and a span whose trace differs from its parent's is
 * marked with its own label. Parents that aren't among the spans are shown as
 * `[<name> traceparent]` (a known trace context) or `[remote]`. A span's
 * `attributes`, if any, are appended in braces.
 *
 * Spans with times (`startTime`, `endTime`, `ended`) are checked against
 * their descendants: a span must cover all spans below it (the envelope).
 * A span that starts after a descendant starts, ends before a descendant ends
 * (by a millisecond or more: the OpenTelemetry SDK records times with
 * millisecond precision, so times within the same millisecond count as
 * covered), or has ended while a descendant hasn't, gets the badge
 * `[error: doesn't cover descendants]`. Omitted spans (`omit`) still count as
 * descendants. A span that hasn't ended gets the badge `[error: not ended]`.
 * Spans without times aren't checked, and neither are `start response` spans
 * (`NextNodeServer.startResponse`, see `isUncheckedSpan`).
 *
 * ```
 * [trace A] GET (Next.request) {http.target=/page}
 * ├─ GET /page (BaseServer.handleRequest) {http.target=/page}
 * │  └─ render route (app) /page (AppRender.getBodyResult)
 * └─ middleware GET (Middleware.execute)
 * ```
 */
export interface TreeSpan {
  id: string
  parentId?: string
  traceId: string
  name: string
  /** The `next.span_type` attribute. */
  type?: string
  /** Attributes to print, in the given order. */
  attributes?: Record<string, string | number | boolean>
  /** Start time, in microseconds since the epoch. */
  startTime?: number
  /** End time, in microseconds since the epoch (when the span has ended). */
  endTime?: number
  /**
   * Whether the span has ended. Defaults to whether `endTime` is set, for
   * spans with times.
   */
  ended?: boolean
}

export const NOT_COVERING_BADGE = "[error: doesn't cover descendants]"
export const NOT_ENDED_BADGE = '[error: not ended]'

function hasTimes(span: TreeSpan) {
  return span.startTime !== undefined
}

/**
 * Spans left out of the envelope check (they're still printed): `start
 * response` starts when the first chunk of the response is written, which can
 * be after the render span that is its parent has ended, sometimes within the
 * same millisecond. Checking it would make its parent's badge flaky.
 */
function isUncheckedSpan(span: TreeSpan) {
  return span.type === 'NextNodeServer.startResponse'
}

function isEnded(span: TreeSpan) {
  return span.ended ?? span.endTime !== undefined
}

// Times within the same millisecond count as covered (see `printSpanTree`).
const TOLERANCE = 1_000

/**
 * Whether `span` covers `descendant`: it starts no later and ends no earlier
 * than the descendant, by less than a millisecond (an ended span can't cover a
 * descendant that hasn't ended).
 */
function covers(span: TreeSpan, descendant: TreeSpan) {
  if (
    !hasTimes(span) ||
    !hasTimes(descendant) ||
    isUncheckedSpan(span) ||
    isUncheckedSpan(descendant)
  ) {
    return true
  }
  if (span.startTime! - descendant.startTime! >= TOLERANCE) {
    return false
  }
  if (!isEnded(span)) {
    return true
  }
  if (!isEnded(descendant)) {
    return false
  }
  return (
    span.endTime === undefined ||
    descendant.endTime === undefined ||
    descendant.endTime - span.endTime < TOLERANCE
  )
}

/** The badges of each span with times (see `printSpanTree`), by span ID. */
export function getEnvelopeBadges(allSpans: TreeSpan[]): Map<string, string[]> {
  const children = new Map<string, TreeSpan[]>()
  for (const span of allSpans) {
    if (span.parentId) {
      let list = children.get(span.parentId)
      if (!list) {
        list = []
        children.set(span.parentId, list)
      }
      list.push(span)
    }
  }

  const badges = new Map<string, string[]>()
  for (const span of allSpans) {
    if (!hasTimes(span)) {
      continue
    }
    const spanBadges: string[] = []
    // All descendants, depth first (guarding against cycles).
    const seen = new Set<string>([span.id])
    const stack = [...(children.get(span.id) ?? [])]
    let coversAll = true
    while (stack.length > 0) {
      const descendant = stack.pop()!
      if (seen.has(descendant.id)) {
        continue
      }
      seen.add(descendant.id)
      if (!covers(span, descendant)) {
        coversAll = false
        break
      }
      stack.push(...(children.get(descendant.id) ?? []))
    }
    if (!coversAll) {
      spanBadges.push(NOT_COVERING_BADGE)
    }
    if (!isEnded(span)) {
      spanBadges.push(NOT_ENDED_BADGE)
    }
    if (spanBadges.length > 0) {
      badges.set(span.id, spanBadges)
    }
  }
  return badges
}

interface Node {
  label: string
  traceId: string
  children: Node[]
}

/** A trace context the test knows, e.g. the `traceparent` it sends. */
export interface KnownTraceContext {
  name: string
  traceId: string
  spanId: string
}

/**
 * One-time work outside of the request's own work: instrumentation
 * registration, app route module loading (in the first request only), and
 * route module prewarming at startup (root `LoadComponents.loadRouteModule`
 * spans, which can still arrive during the first test). Omit it (`omit`) so
 * span tree snapshots don't depend on the test order.
 */
export function isOneTimeSpan(span: TreeSpan) {
  return (
    span.type === 'Instrumentation.loadModule' ||
    span.type === 'Instrumentation.register' ||
    span.type === 'AppRouteRouteModule.loadUserland' ||
    (!span.parentId && span.type === 'LoadComponents.loadRouteModule')
  )
}

export function printSpanTree(
  allSpans: TreeSpan[],
  {
    known = [],
    omit = () => false,
  }: {
    known?: KnownTraceContext[]
    /** Spans to leave out, with their descendants (e.g. `isOneTimeSpan`). */
    omit?: (span: TreeSpan) => boolean
  } = {}
): string {
  const omitted = new Set<string>()
  for (let changed = true; changed; ) {
    changed = false
    for (const span of allSpans) {
      if (
        !omitted.has(span.id) &&
        (omit(span) || (span.parentId && omitted.has(span.parentId)))
      ) {
        omitted.add(span.id)
        changed = true
      }
    }
  }
  const spans = allSpans.filter((span) => !omitted.has(span.id))
  // Checked against all spans: omitted spans are still descendants.
  const envelopeBadges = getEnvelopeBadges(allSpans)

  const knownNames = new Set(known.map((context) => context.name))
  const traceLabels = new Map<string, string>()
  for (const context of known) {
    traceLabels.set(context.traceId, context.name)
  }
  const traceLabel = (traceId: string) => {
    let label = traceLabels.get(traceId)
    if (!label) {
      const count = [...traceLabels.values()].filter(
        (value) => !knownNames.has(value)
      ).length
      label =
        count < 26
          ? String.fromCharCode('A'.charCodeAt(0) + count)
          : String(count + 1)
      traceLabels.set(traceId, label)
    }
    return label
  }

  const nodes = new Map<string, Node>()
  for (const span of spans) {
    const label =
      span.type && span.type !== span.name
        ? `${span.name} (${span.type})`
        : span.name
    const attributes = Object.entries(span.attributes ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join(', ')
    const badges = envelopeBadges.get(span.id)
    nodes.set(span.id, {
      label:
        (attributes ? `${label} {${attributes}}` : label) +
        (badges ? ` ${badges.join(' ')}` : ''),
      traceId: span.traceId,
      children: [],
    })
  }

  // Parents that aren't among the spans, by parent span ID.
  const missingParents = new Map<string, Node>()
  const roots: Node[] = []
  for (const span of spans) {
    const node = nodes.get(span.id)!
    if (!span.parentId) {
      roots.push(node)
      continue
    }
    let parent = nodes.get(span.parentId) ?? missingParents.get(span.parentId)
    if (!parent) {
      const context = known.find(({ spanId }) => spanId === span.parentId)
      parent = {
        label: context ? `[${context.name} traceparent]` : '[remote]',
        traceId: span.traceId,
        children: [],
      }
      missingParents.set(span.parentId, parent)
      roots.push(parent)
    }
    parent.children.push(node)
  }

  const sortNodes = (list: Node[]) =>
    list.sort((a, b) => a.label.localeCompare(b.label))

  // Assign trace labels in a deterministic order (sorted roots, depth first),
  // so the labels don't depend on the order the spans were collected in.
  const assignLabels = (node: Node) => {
    traceLabel(node.traceId)
    sortNodes(node.children).forEach(assignLabels)
  }
  sortNodes(roots).forEach(assignLabels)
  roots.sort(
    (a, b) =>
      traceLabel(a.traceId).localeCompare(traceLabel(b.traceId)) ||
      a.label.localeCompare(b.label)
  )

  const lines: string[] = []
  const print = (node: Node, prefix: string) => {
    node.children.forEach((child, index) => {
      const last = index === node.children.length - 1
      const marker =
        child.traceId !== node.traceId
          ? ` [trace ${traceLabel(child.traceId)}]`
          : ''
      lines.push(`${prefix}${last ? '└─ ' : '├─ '}${child.label}${marker}`)
      print(child, prefix + (last ? '   ' : '│  '))
    })
  }
  for (const root of roots) {
    lines.push(`[trace ${traceLabel(root.traceId)}] ${root.label}`)
    print(root, '')
  }
  return lines.join('\n')
}
