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
    nodes.set(span.id, {
      label: attributes ? `${label} {${attributes}}` : label,
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
