/**
 * Development-only analysis of the RSC (Flight) payload a request sends to the
 * browser, for Request Insights.
 *
 * Dev payloads contain debug-only data that production payloads don't (debug
 * info rows, console replays, owner/stack fields on every element), so their
 * raw size misrepresents production. This analyzer parses the Flight protocol
 * and estimates the payload size with React's debug-only data removed, and
 * attributes the bytes of props data to the Client Component boundaries that
 * receive them. Other development overhead, like longer module ids or
 * development-only Next.js components, is still counted, so the estimate is
 * not a production transfer size.
 *
 * Every JSON position of the normalized payload is a node in a graph. Edges are
 * the JSON structure plus Flight references, including property-path references
 * (`$<id>:<key>:…`) that point into another row. Attribution partitions the
 * bytes of the nodes, so no byte is counted twice:
 * - The props of a Client Component element belong to that element's boundary
 *   instance. React elements nested in props are slots, attributed to whatever
 *   they contain.
 * - A node reachable from a single boundary instance belongs to it. A node
 *   reachable from several instances, or from an instance and non-boundary
 *   content, is "shared".
 * - Everything else (protocol framing, element structure, server-rendered
 *   content, client references, the rest of rows that property paths select
 *   from, ...) is not attributed.
 *
 * Input that the analyzer can't fully account for makes the result
 * `unavailable` rather than reporting a misleading number. The result only
 * contains aggregates and module identifiers, never payload contents.
 */

import type {
  RequestInsightRscPayload,
  RequestInsightRscPayloadBoundary,
} from '../../shared/lib/request-insights'

/** Raw Flight bytes buffered for analysis before giving up. */
export const RSC_PAYLOAD_ANALYSIS_MAX_BYTES = 16 * 1024 * 1024
const MAX_LISTED_BOUNDARIES = 10
// Hex ids and lengths beyond this many digits can't be represented exactly.
const MAX_HEX_DIGITS = 13

const NEWLINE = 0x0a
const COLON = 0x3a
const COMMA = 0x2c

// The row tags of the vendored Flight client's row parser.
// Rows with these tags carry a hex byte length followed by a comma.
const LENGTH_PREFIXED_TAGS = new Set('TAOobUSsLlGgMmV')
// Newline-terminated rows with these tags.
const NEWLINE_TAGS = new Set('IHENDJWRrXxC')
// Debug-only rows: debug info, IO info, console replay, time origin.
const DEBUG_TAGS = new Set('DJWN')
// Non-model rows whose content is JSON that can reference other rows.
const REFERENCING_TAGS = new Set('IC')
// The resource hint codes of `H` rows (`ReactDOMSharedInternals.d` methods).
const HINT_CODES = new Set('DCLmXSM')

const UNSET = -3
const SHARED = -2
const NOT_ATTRIBUTED = -1

type Row = {
  id: number
  idLength: number
  tag: string
  start: number
  end: number
  contentStart: number
  contentEnd: number
  value?: unknown
  hasValue: boolean
}

const enum NodeKind {
  Value,
  Object,
  Array,
  Element,
  Reference,
}

type Reference = {
  id: number
  /** Property path, or null to reference the whole row. */
  path: string[] | null
  /** Whether a path can traverse through this reference to its value. */
  traversable: boolean
}

type Node = {
  kind: NodeKind
  /** Bytes of this node's own syntax, excluding its children. */
  bytes: number
  /** Whether the node's bytes are part of the estimate (model rows only). */
  counted: boolean
  children?: number[]
  keys?: string[]
  reference?: Reference
  /** For Client Component elements: the boundary instance. */
  instance?: number
}

type AnalysisOptions = {
  maxBytes?: number
  /** Turns a raw client module id into a display path. */
  normalizeModulePath?: (modulePath: string) => string
}

class ParseError extends Error {}

const textEncoder = new TextEncoder()
const fatalTextDecoder = new TextDecoder('utf-8', { fatal: true })

/**
 * Collects the chunks of a Flight stream and analyzes them when it ends.
 * Chunks are copied, so callers may reuse their buffers.
 */
export class RscPayloadAnalyzer {
  private chunks: Uint8Array[] = []
  private byteLength = 0
  private tooLarge = false
  private readonly maxBytes: number

  constructor(private readonly options: AnalysisOptions = {}) {
    this.maxBytes = options.maxBytes ?? RSC_PAYLOAD_ANALYSIS_MAX_BYTES
  }

  write(chunk: Uint8Array | string): void {
    if (this.tooLarge) {
      return
    }
    const chunkByteLength =
      typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.byteLength
    this.byteLength += chunkByteLength
    if (this.byteLength > this.maxBytes) {
      this.tooLarge = true
      this.chunks = []
      return
    }
    this.chunks.push(
      typeof chunk === 'string' ? textEncoder.encode(chunk) : copy(chunk)
    )
  }

  end(complete: boolean): RequestInsightRscPayload {
    if (this.tooLarge) {
      return { status: 'unavailable', unavailableReason: 'too-large' }
    }
    try {
      const buffer = concat(this.chunks, this.byteLength)
      this.chunks = []
      return analyzeRscPayload(buffer, complete, this.options)
    } catch {
      return { status: 'unavailable', unavailableReason: 'parse-error' }
    }
  }
}

function copy(chunk: Uint8Array): Uint8Array {
  const result = new Uint8Array(chunk.byteLength)
  result.set(chunk)
  return result
}

function concat(chunks: Uint8Array[], byteLength: number): Uint8Array {
  if (chunks.length === 1) {
    return chunks[0]
  }
  const buffer = new Uint8Array(byteLength)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  return buffer
}

/**
 * Analyzes a Flight payload. `complete` is false when the stream ended early
 * (aborted, cancelled or errored), in which case a truncated last row and
 * missing referenced rows are expected, and the breakdown is omitted.
 */
export function analyzeRscPayload(
  buffer: Uint8Array,
  complete: boolean,
  options: AnalysisOptions = {}
): RequestInsightRscPayload {
  try {
    const rows = parseRows(buffer, complete)
    const graph = new PayloadGraph(rows, options)
    graph.resolve()
    if (complete && graph.hasUnresolvedReferences) {
      throw new ParseError('Unresolved reference')
    }
    const { estimatedBytes, contextBytes } = graph.tally()
    if (!complete) {
      return { status: 'incomplete', estimatedBytes }
    }
    return {
      status: 'complete',
      estimatedBytes,
      ...graph.summarizeBoundaries(contextBytes),
    }
  } catch (error) {
    if (error instanceof ParseError) {
      return { status: 'unavailable', unavailableReason: 'parse-error' }
    }
    throw error
  }
}

function parseHex(value: string): number {
  if (value.length > MAX_HEX_DIGITS || !/^[0-9a-f]*$/.test(value)) {
    throw new ParseError('Invalid hex number')
  }
  // The Flight client reads an empty row id as 0.
  return value === '' ? 0 : parseInt(value, 16)
}

function parseLength(value: string): number {
  if (value === '') {
    throw new ParseError('Missing row length')
  }
  return parseHex(value)
}

function parseRows(buffer: Uint8Array, complete: boolean): Row[] {
  const rows: Row[] = []
  const length = buffer.byteLength
  let position = 0

  while (position < length) {
    const row = parseRow(buffer, position)
    if (!row) {
      if (complete) {
        throw new ParseError('Truncated row')
      }
      // A stream that ended early can end with a partial row.
      break
    }
    parseRowValue(buffer, row)
    rows.push(row)
    position = row.end
  }

  return rows
}

/** Returns undefined if the row is truncated. */
function parseRow(buffer: Uint8Array, start: number): Row | undefined {
  const length = buffer.byteLength
  const colon = buffer.indexOf(COLON, start)
  if (colon === -1) {
    return undefined
  }
  const idString = latin1(buffer, start, colon)
  const id = parseHex(idString)
  let cursor = colon + 1
  if (cursor >= length) {
    return undefined
  }
  const code = buffer[cursor]
  const char = String.fromCharCode(code)

  if (LENGTH_PREFIXED_TAGS.has(char)) {
    cursor++
    const comma = buffer.indexOf(COMMA, cursor)
    if (comma === -1) {
      return undefined
    }
    const contentStart = comma + 1
    const contentEnd = contentStart + parseLength(latin1(buffer, cursor, comma))
    if (contentEnd > length) {
      return undefined
    }
    return {
      id,
      idLength: idString.length,
      tag: char,
      start,
      end: contentEnd,
      contentStart,
      contentEnd,
      hasValue: false,
    }
  }

  let tag = ''
  if ((code > 64 && code < 91) || code === 35 || char === 'r' || char === 'x') {
    if (!NEWLINE_TAGS.has(char)) {
      throw new ParseError('Unknown row tag')
    }
    tag = char
    cursor++
  }
  const newline = buffer.indexOf(NEWLINE, cursor)
  if (newline === -1) {
    return undefined
  }
  return {
    id,
    idLength: idString.length,
    tag,
    start,
    end: newline + 1,
    contentStart: cursor,
    contentEnd: newline,
    hasValue: false,
  }
}

function latin1(buffer: Uint8Array, start: number, end: number): string {
  let result = ''
  for (let i = start; i < end; i++) {
    result += String.fromCharCode(buffer[i])
  }
  return result
}

function parseRowValue(buffer: Uint8Array, row: Row): void {
  const { tag } = row
  if (DEBUG_TAGS.has(tag)) {
    return
  }
  let text: string
  try {
    text = fatalTextDecoder.decode(
      buffer.subarray(row.contentStart, row.contentEnd)
    )
  } catch {
    if (LENGTH_PREFIXED_TAGS.has(tag) && tag !== 'T') {
      // Binary rows hold arbitrary bytes.
      return
    }
    throw new ParseError('Invalid UTF-8')
  }
  if (tag === 'H') {
    // A hint code followed by the hint's JSON arguments.
    if (!HINT_CODES.has(text[0]) || text.length < 2) {
      throw new ParseError('Unknown hint code')
    }
    text = text.slice(1)
  } else if (tag !== '' && tag !== 'E' && !REFERENCING_TAGS.has(tag)) {
    return
  }
  if (text === '') {
    // An empty model row halts its chunk.
    return
  }
  try {
    row.value = JSON.parse(text)
    row.hasValue = true
  } catch {
    throw new ParseError('Invalid JSON row')
  }
}

function isElement(value: unknown): value is unknown[] {
  return Array.isArray(value) && value[0] === '$' && value.length >= 4
}

/**
 * Parses a model string that references another row. Debug-only references
 * (`$Y`) and non-reference strings (dates, bigints, symbols, ...) return
 * undefined. Matches the Flight client's `parseModelString`.
 */
function parseReference(value: string): Reference | undefined {
  if (value.length < 2 || value[0] !== '$') {
    return undefined
  }
  const marker = value[1]
  let reference: string
  let traversable = false
  if (marker === 'L' || marker === '@') {
    // Lazy and promise references don't take a path.
    const id = value.slice(2)
    return /^[0-9a-f]+$/.test(id)
      ? { id: parseHex(id), path: null, traversable: marker === 'L' }
      : undefined
  } else if ('hQWBKZiP'.includes(marker)) {
    reference = value.slice(2)
  } else if (/[0-9a-f]/.test(marker)) {
    reference = value.slice(1)
    traversable = true
  } else {
    return undefined
  }
  const [id, ...path] = reference.split(':')
  if (!/^[0-9a-f]+$/.test(id)) {
    return undefined
  }
  return {
    id: parseHex(id),
    path: path.length > 0 ? path : null,
    traversable,
  }
}

function joinContexts(current: number, next: number): number {
  if (current === UNSET || current === next) {
    return next
  }
  return SHARED
}

// Revived React elements are objects; property paths address their fields.
const ELEMENT_FIELD_INDEX: Record<string, number | undefined> = {
  type: 1,
  key: 2,
  props: 3,
}

class PayloadGraph {
  private readonly nodes: Node[] = []
  private contexts: Int32Array = new Int32Array(0)
  private readonly rowsById = new Map<number, Row[]>()
  /** Root nodes of model rows (several rows can share an id). */
  private readonly modelRoots = new Map<number, number[]>()
  /** Root nodes of non-model rows that can reference other rows. */
  private readonly taggedRoots = new Map<number, number[]>()
  /** Root nodes of hint rows, which apply to the whole page. */
  private readonly hintRoots: number[] = []
  private readonly rowContexts = new Map<number, number>()
  private readonly referenceTargets = new Map<number, number | null>()
  /** Rows that property paths select values from or traverse. */
  private readonly referenceRows = new Map<number, number[]>()
  /** Nodes and rows that are sent but aren't anyone's data. */
  private retained: Uint8Array = new Uint8Array(0)
  private readonly retainedRows = new Set<number>()
  private readonly instanceNames: string[] = []
  private readonly instanceElements: number[] = []
  private readonly clientReferenceNames = new Map<number, string | null>()
  hasUnresolvedReferences = false

  constructor(
    private readonly rows: Row[],
    private readonly options: AnalysisOptions
  ) {
    for (const row of rows) {
      let group = this.rowsById.get(row.id)
      if (!group) {
        group = []
        this.rowsById.set(row.id, group)
      }
      group.push(row)
    }
    for (const row of rows) {
      if (!row.hasValue) {
        continue
      }
      if (row.tag === '') {
        pushToGroup(this.modelRoots, row.id, this.addNode(row.value, true))
      } else if (row.tag === 'H') {
        this.hintRoots.push(this.addNode(row.value, false))
      } else if (REFERENCING_TAGS.has(row.tag)) {
        pushToGroup(this.taggedRoots, row.id, this.addNode(row.value, false))
      }
    }
  }

  private addNode(value: unknown, counted: boolean): number {
    const index = this.nodes.length
    if (typeof value === 'string') {
      const reference = parseReference(value)
      this.nodes.push({
        kind: reference ? NodeKind.Reference : NodeKind.Value,
        bytes: byteLengthOfJson(value),
        counted,
        reference,
      })
      return index
    }
    if (value === null || typeof value !== 'object') {
      this.nodes.push({
        kind: NodeKind.Value,
        bytes: String(JSON.stringify(value)).length,
        counted,
      })
      return index
    }
    if (Array.isArray(value)) {
      if (isElement(value)) {
        // Measured as `["$", type, key, props]`; the dev-only trailing fields
        // (owner, stack, validated) are not part of the estimate.
        const node: Node = { kind: NodeKind.Element, bytes: 2 + 3, counted }
        this.nodes.push(node)
        node.children = [0, 1, 2, 3].map((i) => this.addNode(value[i], counted))
        const clientName = this.getClientReferenceName(value[1])
        if (clientName !== undefined) {
          node.instance = this.instanceNames.length
          this.instanceNames.push(clientName)
          this.instanceElements.push(index)
        }
        return index
      }
      const node: Node = {
        kind: NodeKind.Array,
        bytes: 2 + Math.max(0, value.length - 1),
        counted,
      }
      this.nodes.push(node)
      node.children = value.map((item) => this.addNode(item, counted))
      return index
    }
    const keys = Object.keys(value)
    let bytes = 2 + Math.max(0, keys.length - 1)
    for (const key of keys) {
      bytes += byteLengthOfJson(key) + 1
    }
    const node: Node = { kind: NodeKind.Object, bytes, counted, keys }
    this.nodes.push(node)
    node.children = keys.map((key) =>
      this.addNode((value as Record<string, unknown>)[key], counted)
    )
    return index
  }

  /**
   * Propagates attribution contexts from the root row through structure and
   * references until a fixed point. A context only changes from unset to a
   * specific value and from there to SHARED, so this terminates.
   */
  resolve(): void {
    this.contexts = new Int32Array(this.nodes.length).fill(UNSET)
    const queue: number[] = []
    const reachNode = (node: number, context: number) => {
      const previous = this.contexts[node]
      const next = joinContexts(previous, context)
      if (next !== previous) {
        this.contexts[node] = next
        queue.push(node)
      }
    }
    const reachRow = (id: number, context: number) => {
      if (!this.rowsById.has(id)) {
        this.hasUnresolvedReferences = true
        return
      }
      const previous = this.rowContexts.get(id) ?? UNSET
      const next = joinContexts(previous, context)
      if (next === previous) {
        return
      }
      this.rowContexts.set(id, next)
      for (const root of this.modelRoots.get(id) ?? []) {
        reachNode(root, next)
      }
      if (previous === UNSET) {
        // Client references and stream rows are protocol data, not props.
        for (const root of this.taggedRoots.get(id) ?? []) {
          reachNode(root, NOT_ATTRIBUTED)
        }
      }
    }

    reachRow(0, NOT_ATTRIBUTED)
    for (const root of this.hintRoots) {
      reachNode(root, NOT_ATTRIBUTED)
    }
    for (let index = 0; index < queue.length; index++) {
      const nodeIndex = queue[index]
      const node = this.nodes[nodeIndex]
      const context = this.contexts[nodeIndex]
      switch (node.kind) {
        case NodeKind.Object:
        case NodeKind.Array:
          for (const child of node.children!) {
            reachNode(child, context)
          }
          break
        case NodeKind.Element: {
          // Element structure is never anyone's data, whoever reaches it.
          const [marker, type, key, props] = node.children!
          reachNode(marker, NOT_ATTRIBUTED)
          reachNode(type, NOT_ATTRIBUTED)
          reachNode(key, NOT_ATTRIBUTED)
          reachNode(props, node.instance ?? NOT_ATTRIBUTED)
          break
        }
        case NodeKind.Reference: {
          const reference = node.reference!
          if (reference.path === null) {
            reachRow(reference.id, context)
          } else {
            const target = this.resolveReference(nodeIndex)
            if (target !== null) {
              reachNode(target, context)
            }
          }
          break
        }
        default:
          break
      }
    }

    this.retainReferencedRows()
  }

  /**
   * A property path selects a value from a row (possibly through alias rows).
   * The selected value is attributed like any other reference target, but the
   * rows it's selected from are sent too, so the rest of their content counts
   * toward the estimate without belonging to anyone.
   */
  private retainReferencedRows(): void {
    this.retained = new Uint8Array(this.nodes.length)
    const queue: number[] = []
    const retainNode = (node: number) => {
      if (this.contexts[node] === UNSET && !this.retained[node]) {
        this.retained[node] = 1
        queue.push(node)
      }
    }
    const retainRow = (id: number) => {
      if (this.retainedRows.has(id)) {
        return
      }
      if (!this.rowsById.has(id)) {
        this.hasUnresolvedReferences = true
        return
      }
      this.retainedRows.add(id)
      for (const root of this.modelRoots.get(id) ?? []) {
        retainNode(root)
      }
      for (const root of this.taggedRoots.get(id) ?? []) {
        retainNode(root)
      }
    }

    for (const ids of this.referenceRows.values()) {
      for (const id of ids) {
        retainRow(id)
      }
    }
    for (let index = 0; index < queue.length; index++) {
      const nodeIndex = queue[index]
      const node = this.nodes[nodeIndex]
      if (node.kind === NodeKind.Reference) {
        const reference = node.reference!
        if (reference.path === null) {
          retainRow(reference.id)
        } else {
          const target = this.resolveReference(nodeIndex)
          for (const id of this.referenceRows.get(nodeIndex) ?? []) {
            retainRow(id)
          }
          if (target !== null) {
            retainNode(target)
          }
        }
      } else {
        for (const child of node.children ?? []) {
          retainNode(child)
        }
      }
    }
  }

  /** Resolves a property-path reference like the Flight client does. */
  private resolveReference(nodeIndex: number): number | null {
    let target = this.referenceTargets.get(nodeIndex)
    if (target === undefined) {
      const rows: number[] = []
      target = this.resolvePath(
        this.nodes[nodeIndex].reference!,
        new Set(),
        rows
      )
      if (target === null) {
        this.hasUnresolvedReferences = true
      }
      this.referenceTargets.set(nodeIndex, target)
      this.referenceRows.set(nodeIndex, rows)
    }
    return target
  }

  private resolvePath(
    reference: Reference,
    visiting: Set<number>,
    rows: number[]
  ): number | null {
    const root = this.modelRoots.get(reference.id)?.[0]
    if (root === undefined) {
      return null
    }
    rows.push(reference.id)
    let current: number = root
    for (const name of reference.path ?? []) {
      const value = this.dereference(current, visiting, rows)
      if (value === null) {
        return null
      }
      const node = this.nodes[value]
      let next: number | undefined
      if (node.kind === NodeKind.Object) {
        // Own JSON keys only; a path can never reach a prototype.
        const index = node.keys!.indexOf(name)
        next = index === -1 ? undefined : node.children![index]
      } else if (node.kind === NodeKind.Array) {
        next = /^(0|[1-9][0-9]*)$/.test(name)
          ? node.children![Number(name)]
          : undefined
      } else if (node.kind === NodeKind.Element) {
        const index = ELEMENT_FIELD_INDEX[name]
        next = index === undefined ? undefined : node.children![index]
      }
      if (next === undefined) {
        return null
      }
      current = next
    }
    return current
  }

  /** Follows references that the client resolves to their plain value. */
  private dereference(
    nodeIndex: number,
    visiting: Set<number>,
    rows: number[]
  ): number | null {
    let current = nodeIndex
    while (this.nodes[current].kind === NodeKind.Reference) {
      const reference = this.nodes[current].reference!
      if (!reference.traversable || visiting.has(current)) {
        return null
      }
      visiting.add(current)
      let next: number | null | undefined
      if (reference.path === null) {
        next = this.modelRoots.get(reference.id)?.[0]
        rows.push(reference.id)
      } else {
        next = this.resolvePath(reference, visiting, rows)
      }
      if (next === undefined || next === null) {
        return null
      }
      current = next
    }
    return current
  }

  /** Returns the boundary name if `type` references a client reference row. */
  private getClientReferenceName(type: unknown): string | undefined {
    if (typeof type !== 'string') {
      return undefined
    }
    const reference = parseReference(type)
    if (!reference || reference.path !== null) {
      return undefined
    }
    let name = this.clientReferenceNames.get(reference.id)
    if (name === undefined) {
      const row = this.rowsById.get(reference.id)?.find((r) => r.tag === 'I')
      name = row && Array.isArray(row.value) ? this.formatName(row.value) : null
      this.clientReferenceNames.set(reference.id, name)
    }
    return name ?? undefined
  }

  private formatName(metadata: unknown[]): string {
    const modulePath = normalizeModulePath(
      String(this.resolveString(metadata[0]))
    )
    const exportName = String(this.resolveString(metadata[2]) || 'default')
    const displayPath = this.options.normalizeModulePath
      ? this.options.normalizeModulePath(modulePath)
      : modulePath
    return `${toSafePath(displayPath)}#${exportName}`
  }

  /** Dev payloads outline repeated strings into their own rows. */
  private resolveString(value: unknown): unknown {
    if (typeof value === 'string' && /^\$[0-9a-f]+$/.test(value)) {
      const row = this.rowsById
        .get(parseInt(value.slice(1), 16))
        ?.find((r) => r.tag === '')
      if (row && typeof row.value === 'string') {
        return row.value
      }
    }
    return value
  }

  tally(): { estimatedBytes: number; contextBytes: Map<number, number> } {
    const contextBytes = new Map<number, number>()
    const addBytes = (context: number, bytes: number) => {
      contextBytes.set(context, (contextBytes.get(context) ?? 0) + bytes)
    }

    for (const row of this.rows) {
      if (DEBUG_TAGS.has(row.tag)) {
        continue
      }
      const rowContext = this.rowContexts.get(row.id)
      // Hints apply to the whole page; other rows only count if referenced,
      // or if a property path selects from them.
      if (
        rowContext === undefined &&
        row.tag !== 'H' &&
        !this.retainedRows.has(row.id)
      ) {
        continue
      }
      const wireBytes = row.end - row.start
      if (row.tag === '' && row.hasValue) {
        // `<id>:` + newline; the normalized JSON is counted per node.
        addBytes(NOT_ATTRIBUTED, row.idLength + 2)
      } else if (row.tag === 'E') {
        // Production error rows only carry the digest.
        const digest = (row.value as { digest?: unknown } | undefined)?.digest
        addBytes(
          NOT_ATTRIBUTED,
          row.idLength + 3 + Buffer.byteLength(JSON.stringify({ digest }))
        )
      } else if (LENGTH_PREFIXED_TAGS.has(row.tag)) {
        // Outlined text and binary data belongs to whoever references it.
        const contentBytes = row.contentEnd - row.contentStart
        addBytes(rowContext ?? NOT_ATTRIBUTED, contentBytes)
        addBytes(NOT_ATTRIBUTED, wireBytes - contentBytes)
      } else {
        addBytes(NOT_ATTRIBUTED, wireBytes)
      }
    }

    for (let index = 0; index < this.nodes.length; index++) {
      const node = this.nodes[index]
      const context = this.contexts[index]
      if (!node.counted) {
        continue
      }
      if (context !== UNSET) {
        addBytes(
          node.kind === NodeKind.Element ? NOT_ATTRIBUTED : context,
          node.bytes
        )
      } else if (this.retained[index]) {
        addBytes(NOT_ATTRIBUTED, node.bytes)
      }
    }

    // Every counted byte belongs to exactly one context.
    let estimatedBytes = 0
    for (const bytes of contextBytes.values()) {
      estimatedBytes += bytes
    }
    return { estimatedBytes, contextBytes }
  }

  summarizeBoundaries(
    contextBytes: Map<number, number>
  ): Pick<
    RequestInsightRscPayload,
    | 'boundaries'
    | 'otherBoundariesBytes'
    | 'frameworkBoundariesBytes'
    | 'sharedBytes'
  > {
    const byName = new Map<string, RequestInsightRscPayloadBoundary>()
    let frameworkBoundariesBytes = 0
    for (let instance = 0; instance < this.instanceNames.length; instance++) {
      if (this.contexts[this.instanceElements[instance]] === UNSET) {
        // The element is not part of the payload (e.g. debug-only data).
        continue
      }
      const name = this.instanceNames[instance]
      const bytes = contextBytes.get(instance) ?? 0
      if (isFrameworkModule(name)) {
        frameworkBoundariesBytes += bytes
        continue
      }
      const boundary = byName.get(name)
      if (boundary) {
        boundary.instances++
        boundary.bytes += bytes
        boundary.largestInstanceBytes = Math.max(
          boundary.largestInstanceBytes,
          bytes
        )
      } else {
        byName.set(name, {
          name,
          instances: 1,
          bytes,
          largestInstanceBytes: bytes,
        })
      }
    }

    const sorted = [...byName.values()].sort(
      (a, b) => b.bytes - a.bytes || (a.name < b.name ? -1 : 1)
    )
    const boundaries = sorted.slice(0, MAX_LISTED_BOUNDARIES)
    let otherBoundariesBytes = 0
    for (const boundary of sorted.slice(MAX_LISTED_BOUNDARIES)) {
      otherBoundariesBytes += boundary.bytes
    }

    return {
      boundaries,
      otherBoundariesBytes,
      frameworkBoundariesBytes,
      sharedBytes: contextBytes.get(SHARED) ?? 0,
    }
  }
}

function pushToGroup(map: Map<number, number[]>, id: number, value: number) {
  const group = map.get(id)
  if (group) {
    group.push(value)
  } else {
    map.set(id, [value])
  }
}

function byteLengthOfJson(value: string): number {
  return Buffer.byteLength(JSON.stringify(value))
}

/**
 * Strips bundler decorations from a client module id:
 * - Turbopack: `[project]/app/page.tsx [app-client] (ecmascript)`
 * - webpack: `(app-pages-browser)/./app/page.tsx`
 */
function normalizeModulePath(moduleId: string): string {
  return moduleId
    .replace(/^\[project\]\//, '')
    .replace(/ \[[^\]]*\].*$/, '')
    .replace(/^\([^)]*\)\//, '')
    .replace(/^\.\//, '')
}

function toSafePath(modulePath: string): string {
  // Never store absolute paths; fall back to the file name.
  if (/^(\/|[A-Za-z]:[\\/]|\\\\)/.test(modulePath)) {
    const segments = modulePath.split(/[\\/]/)
    return segments[segments.length - 1]
  }
  return modulePath
}

function isFrameworkModule(name: string): boolean {
  return /(^|\/)next\/dist\//.test(name)
}
