import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { RotatingFile } from '../../../lib/rotating-file'
import path from 'path'
import { createInterface } from 'readline'
import { pipeline } from 'stream/promises'
import { promisify } from 'util'
import { createGunzip, gzip } from 'zlib'
import {
  getRequestInsightKey,
  getRequestInsightKind,
  isSameRequestInsightFetch,
  MAX_LIVE_COMPLETED_REQUEST_INSIGHTS,
  REQUEST_INSIGHT_REQUEST_SPAN_TYPE,
  type RequestInsight,
} from '../../../shared/lib/request-insights'
import type { RequestInsightUpdate } from './request-insights'
import {
  getRequestInsightTags,
  matchesRequestInsightFilters,
  REQUEST_INSIGHT_FILTERS,
  summarizeRequestInsight,
  type RequestInsightFilter,
  type RequestInsightsHistoryPage,
  type RequestInsightSummary,
} from '../../../shared/lib/request-insights-summary'

// History scans must stay bounded regardless of the journal's compression ratio.
const HISTORY_ENTRY_LIMIT = 1000
const JOURNAL_SIZE_LIMIT = 50 * 1024 * 1024
const JOURNAL_WRITE_BATCH_BYTES = 64 * 1024
const JOURNAL_FILENAME = 'request-insights.ndjson.gz'
const compress = promisify(gzip)
const REQUEST_INSIGHTS_JOURNAL_KEY = Symbol.for(
  `@next/request-insights-journal@${process.env.__NEXT_VERSION}`
)

type RequestMetadata = Omit<RequestInsight, 'spans' | 'fetches'>
type JournalRecord =
  | { version: 1; request: RequestInsight }
  | ({ version: 2; request: RequestMetadata } & RequestInsightUpdate)

type JournalFilter = {
  requestId?: string
  htmlRequestId?: string
  kind?: RequestInsight['kind']
  limit?: number
  indexedOnly?: boolean
}

type HistoryFilter = {
  cursor?: string
  filters?: readonly RequestInsightFilter[]
  liveRequestKeys?: readonly string[]
  limit?: number
  showInternal?: boolean
}

type IndexedSummary = {
  sequence: number
  request: RequestInsightSummary
}

type PendingAppend = {
  line: string
  key: string
  summary: RequestInsightSummary
}

type AppendBatch = {
  kind: 'append'
  records: PendingAppend[]
  byteLength: number
}

type UpdateInput =
  | { kind: 'live'; request: RequestInsight }
  | { kind: 'archived' }

type PendingUpdate = {
  identity: Pick<RequestInsight, 'requestId' | 'kind'>
  key: string
  update: RequestInsightUpdate
} & (
  | {
      kind: 'live'
      request: RequestInsight
      spanCount: number
      fetchCount: number
    }
  | { kind: 'archived' }
)

type ArchivedUpdateBatch = {
  kind: 'archived-batch'
  key: string
  updates: Array<Extract<PendingUpdate, { kind: 'archived' }>>
  byteLength: number
}

type PendingWrite = AppendBatch | PendingUpdate | ArchivedUpdateBatch

type ArchivedRequest = {
  loaded: boolean
  request: RequestInsight | undefined
}

type JournalCursor = {
  sessionId: string
  generation: number
  beforeSequence: number
}

class RequestInsightsJournal {
  private writes = Promise.resolve()
  private pending: AppendBatch | ArchivedUpdateBatch | undefined
  private needsReset = false
  private readonly writer: RotatingFile
  private sequence = 0
  private summaries = new Map<string, IndexedSummary>()
  private pendingRequests = new Set<string>()
  private sessionId = createSessionId()
  private generation = 0
  private truncated = false

  constructor(readonly file: string) {
    this.writer = new RotatingFile(file, JOURNAL_SIZE_LIMIT)
  }

  append(request: RequestInsight): void {
    let line: string
    try {
      line = `${JSON.stringify({ version: 1, request } satisfies JournalRecord)}\n`
    } catch {
      return
    }

    const byteLength = Buffer.byteLength(line, 'utf8')
    const summary = summarizeRequestInsight(request)
    const key = getRequestInsightKey(request)
    this.pendingRequests.add(key)
    let batch = this.pending
    if (
      batch?.kind !== 'append' ||
      batch.byteLength + byteLength > JOURNAL_WRITE_BATCH_BYTES
    ) {
      batch = { kind: 'append', records: [], byteLength: 0 }
      this.enqueue(batch)
    }
    batch.records.push({ line, key, summary })
    batch.byteLength += byteLength
  }

  private enqueue(batch: PendingWrite): void {
    this.pending =
      batch.kind === 'append' || batch.kind === 'archived-batch'
        ? batch
        : undefined
    this.writes = this.writes.then(async () => {
      if (this.pending === batch) this.pending = undefined
      try {
        // Never prepare journal-only deltas against bytes damaged by a failed
        // member. A failed reset skips this batch and remains retryable.
        if (this.needsReset) {
          this.rotate()
          this.needsReset = false
        }
        if (batch.kind === 'append') {
          // Only completed requests share a gzip dictionary.
          this.write(
            await compress(batch.records.map(({ line }) => line).join(''))
          )
          for (const record of batch.records) {
            this.indexSummary(record.key, {
              sequence: ++this.sequence,
              request: record.summary,
            })
          }
        } else {
          // Share lazy replay, not compression: each late delta stays a member.
          const archive: ArchivedRequest = { loaded: false, request: undefined }
          const updates =
            batch.kind === 'archived-batch' ? batch.updates : [batch]
          for (const update of updates) {
            const prepared = await this.prepareUpdate(update, archive)
            if (!prepared) continue
            this.write(prepared.data)
            this.indexSummary(update.key, {
              sequence:
                this.summaries.get(update.key)?.sequence ?? ++this.sequence,
              request: prepared.summary,
            })
          }
        }
      } catch (error) {
        console.warn('Failed to write Request Insights journal', error)
      } finally {
        if (batch.kind === 'append') {
          for (const record of batch.records)
            this.pendingRequests.delete(record.key)
        }
      }
    })
  }

  private write(data: Buffer): void {
    try {
      if (this.writer.size > 0 && this.writer.wouldExceed(data.length))
        this.rotate()
      this.writer.write(data)
    } catch (error) {
      // Even an exception after a short write can leave a torn gzip member.
      // Do not index it or append another member until the file is reset.
      this.needsReset = true
      throw error
    }
  }

  appendArchivedUpdate(
    identity: Pick<RequestInsight, 'requestId' | 'kind'>,
    update: RequestInsightUpdate
  ): boolean {
    const key = getRequestInsightKey(identity)
    if (!this.summaries.has(key) && !this.pendingRequests.has(key)) {
      return false
    }
    this.appendUpdate(identity, update, { kind: 'archived' })
    return true
  }

  appendUpdate(
    identity: Pick<RequestInsight, 'requestId' | 'kind'>,
    update: RequestInsightUpdate,
    source: UpdateInput
  ): void {
    const key = getRequestInsightKey(identity)
    if (source.kind === 'live') {
      const { request } = source
      this.enqueue({
        kind: 'live',
        identity,
        key,
        update,
        request: { ...request },
        // Live arrays grow while queued writes wait; retain exact boundaries.
        spanCount: request.spans.length,
        fetchCount: request.fetches.length,
      })
    } else {
      let byteLength: number
      try {
        // Include framing overhead so even empty updates consume the budget.
        byteLength = Buffer.byteLength(JSON.stringify(update)) + 64
      } catch {
        return
      }
      let batch = this.pending
      if (
        batch?.kind !== 'archived-batch' ||
        batch.key !== key ||
        batch.byteLength + byteLength > JOURNAL_WRITE_BATCH_BYTES
      ) {
        batch = { kind: 'archived-batch', key, updates: [], byteLength: 0 }
        this.enqueue(batch)
      }
      batch.updates.push({ kind: 'archived', identity, key, update })
      batch.byteLength += byteLength
    }
  }

  private async prepareUpdate(
    batch: PendingUpdate,
    archive: ArchivedRequest
  ): Promise<{ data: Buffer; summary: RequestInsightSummary } | undefined> {
    const previous = this.summaries.get(batch.key)?.request
    const request = batch.kind === 'live' ? batch.request : previous
    // Truncation (including error recovery) discards journal-only delta bases.
    if (!request) return
    const { span } = batch.update
    let { fetch } = batch.update
    const loadArchived = async () => {
      if (!archive.loaded) {
        archive.request = (
          await readJournalFile(this.file, {
            requestId: batch.identity.requestId,
            kind: getRequestInsightKind(batch.identity),
          })
        )[0]
        archive.loaded = true
      }
      return archive.request
    }
    if (batch.kind === 'archived' && fetch) {
      const stored = await loadArchived()
      if (!stored) return
      const candidate = fetch
      if (
        stored.fetches.some((existing) =>
          isSameRequestInsightFetch(existing, candidate)
        )
      )
        fetch = undefined
    }
    if (!span && !fetch) return
    let canonicalSpans: RequestInsight['spans'] | undefined
    if (
      span?.attributes?.['next.span_type'] === REQUEST_INSIGHT_REQUEST_SPAN_TYPE
    ) {
      if (batch.kind === 'live') {
        canonicalSpans = batch.request.spans.slice(0, batch.spanCount)
      } else {
        const stored = await loadArchived()
        if (!stored) return
        canonicalSpans = [...stored.spans, span]
      }
    }
    const metadata = getRequestMetadata(request)
    if (span?.status === 'error') metadata.status = 'error'
    else if (metadata.status !== 'error' && span?.status === 'ok')
      metadata.status = 'ok'
    const delta = summarizeRequestInsight({
      ...metadata,
      spans: span ? [span] : [],
      fetches: fetch ? [fetch] : [],
    })
    let summary: RequestInsightSummary = {
      ...delta,
      spanCount:
        batch.kind === 'live'
          ? batch.spanCount
          : (previous?.spanCount ?? 0) + (span ? 1 : 0),
      fetchCount:
        batch.kind === 'live'
          ? batch.fetchCount
          : (previous?.fetchCount ?? 0) + (fetch ? 1 : 0),
      statusCode: previous?.statusCode ?? delta.statusCode,
      isRsc: previous?.isRsc ?? delta.isRsc,
      hasError: !!previous?.hasError || delta.hasError,
      hasProxyActivity: !!previous?.hasProxyActivity || delta.hasProxyActivity,
      cacheStatuses: [
        ...new Set([
          ...(previous?.cacheStatuses ?? []),
          ...delta.cacheStatuses,
        ]),
      ],
    }
    if (canonicalSpans) {
      const canonical = summarizeRequestInsight({
        ...metadata,
        spans: canonicalSpans,
        fetches: [],
      })
      summary.statusCode = canonical.statusCode
      summary.isRsc = canonical.isRsc
    }
    let data = await compress(
      `${JSON.stringify({ version: 2, request: metadata, span, fetch } satisfies JournalRecord)}\n`
    )
    if (!previous || this.writer.wouldExceed(data.length)) {
      let fullRequest: RequestInsight
      if (batch.kind === 'live') {
        fullRequest = {
          ...batch.request,
          ...metadata,
          spans: batch.request.spans.slice(0, batch.spanCount),
          fetches: batch.request.fetches.slice(0, batch.fetchCount),
        }
      } else {
        const stored = await loadArchived()
        if (!stored) return
        fullRequest = {
          ...stored,
          ...metadata,
          spans: span ? [...stored.spans, span] : stored.spans,
          fetches: fetch ? [...stored.fetches, fetch] : stored.fetches,
        }
      }
      data = await compress(
        `${JSON.stringify({ version: 1, request: fullRequest } satisfies JournalRecord)}\n`
      )
      summary = summarizeRequestInsight(fullRequest)
    }
    // Earlier span-only updates are on disk before the first replay. Once
    // loaded, keep the shared record current for deduplication and rotation.
    if (archive.request) {
      Object.assign(archive.request, metadata)
      if (span) archive.request.spans.push(span)
      if (fetch) archive.request.fetches.push(fetch)
    }
    return { data, summary }
  }

  private indexSummary(key: string, summary: IndexedSummary): void {
    this.summaries.set(key, summary)
    if (this.summaries.size > HISTORY_ENTRY_LIMIT) {
      // Map insertion order preserves the oldest entry even when late updates
      // replace its summary. Internal requests count toward the same budget.
      this.summaries.delete(this.summaries.keys().next().value!)
      this.truncated = true
    }
  }

  private rotate(): void {
    this.writer.rotate()
    this.summaries.clear()
    this.generation++
    this.truncated = true
  }

  async initialize(): Promise<void> {
    await this.flush()
    this.writer.rotate()
    this.writer.close()
    this.sequence = 0
    this.summaries.clear()
    this.sessionId = createSessionId()
    this.generation = 0
    this.truncated = false
    this.needsReset = false
  }

  async configure(): Promise<void> {
    await this.flush()
    this.writer.close()
    this.writer.size = 0
    try {
      this.writer.size = (await stat(this.file)).size
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
  }

  async read(filter: JournalFilter): Promise<RequestInsight[]> {
    await this.flush()
    if (filter.indexedOnly) {
      const { requestId } = filter
      if (requestId === undefined) return []
      const kind = getRequestInsightKind(filter)
      // Detail misses must not replay the journal. Internal readers can still
      // access disk records whose summaries were evicted from the index.
      if (!this.summaries.has(getRequestInsightKey({ requestId, kind }))) {
        return []
      }
      filter = { ...filter, kind }
    }
    return readJournalFile(this.file, filter)
  }

  async getHistory(
    filter: HistoryFilter = {}
  ): Promise<RequestInsightsHistoryPage> {
    if (
      (filter.liveRequestKeys?.length ?? 0) >
      MAX_LIVE_COMPLETED_REQUEST_INSIGHTS
    ) {
      throw new Error('Too many live Request Insights keys')
    }
    await this.flush()

    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 200)
    const cursor = filter.cursor
      ? decodeCursor(filter.cursor)
      : {
          sessionId: this.sessionId,
          generation: this.generation,
          beforeSequence: Number.POSITIVE_INFINITY,
        }
    if (
      !cursor ||
      cursor.sessionId !== this.sessionId ||
      cursor.generation !== this.generation
    ) {
      throw new StaleRequestInsightsHistoryCursorError()
    }

    const showInternal = filter.showInternal ?? false
    const visible = [...this.summaries.values()].filter(
      ({ request }) =>
        showInternal || getRequestInsightKind(request) === 'request'
    )
    const optionCounts = Object.fromEntries(
      REQUEST_INSIGHT_FILTERS.map((requestFilter) => [requestFilter, 0])
    ) as Record<RequestInsightFilter, number>
    for (const { request } of this.summaries.values()) {
      const tags = getRequestInsightTags(request)
      if (getRequestInsightKind(request) === 'request' || showInternal) {
        for (const tag of tags) {
          optionCounts[tag]++
        }
      } else if (tags.has('activity:instant-insights')) {
        optionCounts['activity:instant-insights']++
      }
    }

    const matching = visible.filter(({ request }) =>
      matchesRequestInsightFilters(request, filter.filters ?? [])
    )
    const page = matching
      .filter(({ sequence }) => sequence < cursor.beforeSequence)
      .toReversed()
      .slice(0, limit)
    const lastSequence = page.at(-1)?.sequence
    const hasMore =
      lastSequence !== undefined &&
      matching.some(({ sequence }) => sequence < lastSequence)

    return {
      sessionId: this.sessionId,
      generation: this.generation,
      requests: page.map(({ request }) => request),
      matchingRequestCount: matching.length,
      totalRequestCount: visible.length,
      optionCounts,
      liveRequestOverlaps: filter.liveRequestKeys
        ? [...new Set(filter.liveRequestKeys)].flatMap((key) => {
            const summary = this.summaries.get(key)
            return summary ? [summary.request] : []
          })
        : undefined,
      nextCursor: hasMore
        ? encodeCursor({
            sessionId: this.sessionId,
            generation: this.generation,
            beforeSequence: lastSequence,
          })
        : undefined,
      truncated: this.truncated,
    }
  }

  flush(): Promise<void> {
    this.pending = undefined
    return this.writes
  }

  async close(): Promise<void> {
    await this.flush()
    this.writer.close()
  }
}

export class StaleRequestInsightsHistoryCursorError extends Error {
  name = 'StaleRequestInsightsHistoryCursorError'
}

type JournalRegistry = {
  configured?: RequestInsightsJournal
  journals: Map<string, RequestInsightsJournal>
}

export function appendRequestInsightToJournal(request: RequestInsight): void {
  getJournalRegistry().configured?.append(request)
}

export function appendRequestInsightUpdateToJournal(
  request: RequestInsight,
  update: RequestInsightUpdate
): void {
  getJournalRegistry().configured?.appendUpdate(request, update, {
    kind: 'live',
    request,
  })
}

export function appendArchivedRequestInsightUpdateToJournal(
  identity: Pick<RequestInsight, 'requestId' | 'kind'>,
  update: RequestInsightUpdate
): boolean {
  return (
    getJournalRegistry().configured?.appendArchivedUpdate(identity, update) ??
    false
  )
}

export async function getRequestInsightsHistory(
  distDir: string,
  filter: HistoryFilter = {}
): Promise<RequestInsightsHistoryPage> {
  return getOrCreateRequestInsightsJournal(distDir).getHistory(filter)
}

export async function readRequestInsightsJournal(
  distDir: string,
  filter: JournalFilter = {}
): Promise<RequestInsight[]> {
  return getOrCreateRequestInsightsJournal(distDir).read(filter)
}

async function readJournalFile(
  file: string,
  filter: JournalFilter
): Promise<RequestInsight[]> {
  if (filter.limit !== undefined && filter.limit <= 0) return []
  const matches = new Map<string, RequestInsight>()
  try {
    // Initialization leaves an empty file until the first completed record.
    if ((await stat(file)).size === 0) return []
    const input = createGunzip()
    await pipeline(createReadStream(file), input, async () => {
      const lines = createInterface({ input, crlfDelay: Infinity })
      for await (const line of lines) {
        const record = parseJournalLine(line)
        if (!record) continue
        const request = record.request
        if (
          (filter.requestId !== undefined &&
            request.requestId !== filter.requestId) ||
          (filter.htmlRequestId !== undefined &&
            request.htmlRequestId !== filter.htmlRequestId) ||
          (filter.kind !== undefined &&
            getRequestInsightKind(request) !== filter.kind)
        ) {
          continue
        }

        const key = getRequestInsightKey(request)
        if (record.version === 1) {
          matches.set(key, record.request)
          if (filter.limit !== undefined && matches.size > filter.limit) {
            matches.delete(matches.keys().next().value!)
          }
        } else {
          const stored = matches.get(key)
          if (stored) {
            Object.assign(stored, request)
            if (record.span) stored.spans.push(record.span)
            if (record.fetch) stored.fetches.push(record.fetch)
          }
        }
      }
    })
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.warn('Failed to read Request Insights journal', error)
    }
  }

  return [...matches.values()]
}

export async function resetRequestInsightsJournalForTest(): Promise<void> {
  await closeRequestInsightsJournal()
}

export async function closeRequestInsightsJournal(): Promise<void> {
  const registry = getJournalRegistry()
  await Promise.all(
    [...registry.journals.values()].map((journal) => journal.close())
  )
  // TODO(as-any): pre-existing cast, not yet reviewed
  // eslint-disable-next-line @next/internal/no-as-any
  delete (globalThis as any)[REQUEST_INSIGHTS_JOURNAL_KEY]
}

export async function initializeRequestInsightsJournal(
  distDir: string
): Promise<void> {
  const journal = getOrCreateRequestInsightsJournal(distDir)
  getJournalRegistry().configured = journal
  await journal.initialize()
}

export async function configureRequestInsightsJournal(
  distDir: string
): Promise<void> {
  const journal = getOrCreateRequestInsightsJournal(distDir)
  getJournalRegistry().configured = journal
  await journal.configure()
}

function getJournalRegistry(): JournalRegistry {
  const globalStore = globalThis as typeof globalThis & {
    [REQUEST_INSIGHTS_JOURNAL_KEY]?: JournalRegistry
  }
  return (globalStore[REQUEST_INSIGHTS_JOURNAL_KEY] ??= {
    journals: new Map(),
  })
}

function getOrCreateRequestInsightsJournal(
  distDir: string
): RequestInsightsJournal {
  const file = path.join(distDir, JOURNAL_FILENAME)
  const registry = getJournalRegistry()
  let journal = registry.journals.get(file)
  if (!journal) {
    journal = new RequestInsightsJournal(file)
    registry.journals.set(file, journal)
  }
  return journal
}

function parseJournalLine(line: string): JournalRecord | undefined {
  try {
    const record = JSON.parse(line) as Partial<JournalRecord>
    const request = record.request
    if (
      !request ||
      typeof request.requestId !== 'string' ||
      typeof request.htmlRequestId !== 'string'
    ) {
      return undefined
    }
    if (
      record.version === 1 &&
      Array.isArray(record.request?.spans) &&
      Array.isArray(record.request?.fetches)
    ) {
      return record as JournalRecord
    }
    if (record.version === 2 && (record.span || record.fetch)) {
      return record as JournalRecord
    }
    return undefined
  } catch {
    return undefined
  }
}

function getRequestMetadata(request: RequestMetadata): RequestMetadata {
  return {
    requestId: request.requestId,
    kind: request.kind,
    source: request.source,
    proxyStatus: request.proxyStatus,
    htmlRequestId: request.htmlRequestId,
    route: request.route,
    url: request.url,
    startTime: request.startTime,
    durationMs: request.durationMs,
    completedAt: request.completedAt,
    status: request.status,
  }
}

function createSessionId(): string {
  return `${process.pid.toString(36)}-${Date.now().toString(36)}-${process.hrtime.bigint().toString(36)}`
}

function encodeCursor(cursor: JournalCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

function decodeCursor(cursor: string): JournalCursor | undefined {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    ) as Partial<JournalCursor>
    return typeof parsed.sessionId === 'string' &&
      typeof parsed.generation === 'number' &&
      typeof parsed.beforeSequence === 'number'
      ? (parsed as JournalCursor)
      : undefined
  } catch {
    return undefined
  }
}
