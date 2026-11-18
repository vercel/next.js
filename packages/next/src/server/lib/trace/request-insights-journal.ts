import { createReadStream } from 'fs'
import { createGunzip } from 'zlib'
import { pipeline } from 'stream/promises'
import { PassThrough } from 'stream'
import {
  getRequestInsightsArchiveFiles,
  RequestInsightsArchives,
} from './request-insights-archive'
import path from 'path'
import { RotatingFile } from '../../../lib/rotating-file'
import isError from '../../../lib/is-error'
import { createInterface } from 'readline'
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

const JOURNAL_SIZE_LIMIT = 10 * 1024 * 1024
const ARCHIVE_MAINTENANCE_INTERVAL = 60 * 60 * 1000
const JOURNAL_WRITE_BATCH_BYTES = 64 * 1024
const JOURNAL_FILENAME = 'request-insights.ndjson'
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
  byteLength: number
  key: string
  summary: RequestInsightSummary
}

type AppendBatch = {
  records: PendingAppend[]
  byteLength: number
}

type JournalCursor = {
  sessionId: string
  generation: number
  beforeSequence: number
}

class RequestInsightsJournal {
  private writes = Promise.resolve()
  private pendingAppends: AppendBatch | undefined
  private readonly writer: RotatingFile
  private sequence = 0
  private summaries = new Map<string, IndexedSummary>()
  private pendingRequests = new Set<string>()
  private sessionId = createSessionId()
  private generation = 0
  private truncated = false

  private readonly archives: RequestInsightsArchives
  private maintenanceTimer: ReturnType<typeof setInterval> | undefined

  constructor(readonly file: string) {
    this.writer = new RotatingFile(file, JOURNAL_SIZE_LIMIT)
    this.archives = new RequestInsightsArchives(this.writer)
  }

  // Reads and lifecycle changes must share the write queue too: a read must not
  // race a rename, and an append queued during startup must use the new session.
  private run<T>(operation: () => Promise<T>): Promise<T> {
    this.pendingAppends = undefined
    const result = this.writes.then(operation)
    this.writes = result.then(
      () => {},
      () => {}
    )
    return result
  }

  private startMaintenance(): void {
    if (this.maintenanceTimer) return
    this.maintenanceTimer = setInterval(() => {
      void this.run(() => this.archives.maintain())
    }, ARCHIVE_MAINTENANCE_INTERVAL)
    this.maintenanceTimer.unref()
  }

  async close(): Promise<void> {
    clearInterval(this.maintenanceTimer)
    this.maintenanceTimer = undefined
    await this.flush()
    // A queued initialize/configure may have installed a timer while closing.
    clearInterval(this.maintenanceTimer)
    this.maintenanceTimer = undefined
    this.writer.close()
  }

  read(filter: JournalFilter): Promise<RequestInsight[]> {
    return this.run(async () => {
      const files =
        filter.requestId !== undefined || filter.htmlRequestId !== undefined
          ? [...(await getRequestInsightsArchiveFiles(this.file)), this.file]
          : [this.file]
      return readJournalFiles(files, filter)
    })
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
    let batch = this.pendingAppends
    if (!batch || batch.byteLength + byteLength > JOURNAL_WRITE_BATCH_BYTES) {
      batch = { records: [], byteLength: 0 }
      this.pendingAppends = batch
      const queuedBatch = batch
      this.writes = this.writes
        .then(async () => {
          if (this.pendingAppends === queuedBatch)
            this.pendingAppends = undefined
          await this.appendRequests(queuedBatch.records)
        })
        .catch((error) => {
          console.warn('Failed to write Request Insights journal', error)
        })
        .finally(() => {
          for (const record of queuedBatch.records) {
            this.pendingRequests.delete(record.key)
          }
        })
    }
    batch.records.push({ line, byteLength, key, summary })
    batch.byteLength += byteLength
  }

  private async appendRequests(records: PendingAppend[]): Promise<void> {
    let index = 0
    while (index < records.length) {
      if (
        this.writer.size > 0 &&
        this.writer.wouldExceed(records[index].byteLength)
      ) {
        await this.rotate()
      }
      const start = index
      let byteLength = 0
      let lines = ''
      do {
        const record = records[index++]
        lines += record.line
        byteLength += record.byteLength
      } while (
        index < records.length &&
        !this.writer.wouldExceed(byteLength + records[index].byteLength)
      )
      this.writer.write(Buffer.from(lines, 'utf8'))
      for (let i = start; i < index; i++) {
        const record = records[i]
        this.archives.recordTime(record.summary.startTime)
        this.summaries.set(record.key, {
          sequence: ++this.sequence,
          request: record.summary,
        })
      }
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
    this.appendUpdate(identity, update)
    return true
  }

  appendUpdate(
    identity: Pick<RequestInsight, 'requestId' | 'kind'>,
    update: RequestInsightUpdate,
    request?: RequestInsight
  ): void {
    this.pendingAppends = undefined
    const key = getRequestInsightKey(identity)
    // The live arrays keep growing while writes wait, so capture their lengths.
    const snapshot = request && { ...request }
    const filter = {
      requestId: identity.requestId,
      kind: getRequestInsightKind(identity),
    }
    const spanCount = request?.spans.length
    const fetchCount = request?.fetches.length
    this.writes = this.writes
      .then(async () => {
        const previous = this.summaries.get(key)?.request
        if (!previous && !snapshot) {
          return
        }
        const { span } = update
        let { fetch } = update
        let archived: RequestInsight | undefined
        if (!snapshot && fetch) {
          archived = (await readJournalFiles([this.file], filter))[0]
          if (!archived) return
          if (
            archived.fetches.some((existing) =>
              isSameRequestInsightFetch(existing, fetch!)
            )
          ) {
            fetch = undefined
          }
        }
        if (!span && !fetch) return

        const metadata = getRequestMetadata(snapshot ?? previous!)
        if (span?.status === 'error') metadata.status = 'error'
        else if (metadata.status !== 'error' && span?.status === 'ok')
          metadata.status = 'ok'
        const summary = summarizeRequestInsight({
          ...metadata,
          spans: span ? [span] : [],
          fetches: fetch ? [fetch] : [],
        })
        let line = `${JSON.stringify({ version: 2, request: metadata, span, fetch } satisfies JournalRecord)}\n`
        let updatedSummary: RequestInsightSummary = {
          ...summary,
          spanCount: spanCount ?? (previous?.spanCount ?? 0) + (span ? 1 : 0),
          fetchCount:
            fetchCount ?? (previous?.fetchCount ?? 0) + (fetch ? 1 : 0),
          statusCode: previous?.statusCode ?? summary.statusCode,
          isRsc: previous?.isRsc ?? summary.isRsc,
          hasError: !!previous?.hasError || summary.hasError,
          hasProxyActivity:
            !!previous?.hasProxyActivity || summary.hasProxyActivity,
          cacheStatuses: [
            ...new Set([
              ...(previous?.cacheStatuses ?? []),
              ...summary.cacheStatuses,
            ]),
          ],
        }
        if (
          span?.attributes?.['next.span_type'] ===
          REQUEST_INSIGHT_REQUEST_SPAN_TYPE
        ) {
          archived ??=
            snapshot ?? (await readJournalFiles([this.file], filter))[0]
          if (!archived) return
          const canonicalSummary = summarizeRequestInsight({
            ...metadata,
            spans: snapshot
              ? snapshot.spans.slice(0, spanCount)
              : [...archived.spans, span],
            fetches: [],
          })
          updatedSummary.statusCode = canonicalSummary.statusCode
          updatedSummary.isRsc = canonicalSummary.isRsc
        }
        if (
          !previous ||
          this.writer.wouldExceed(Buffer.byteLength(line, 'utf8'))
        ) {
          let fullRequest: RequestInsight
          if (snapshot) {
            fullRequest = {
              ...snapshot,
              spans: snapshot.spans.slice(0, spanCount),
              fetches: snapshot.fetches.slice(0, fetchCount),
            }
          } else {
            archived ??= (await readJournalFiles([this.file], filter))[0]
            if (!archived) return
            fullRequest = { ...archived, ...metadata }
            if (span) fullRequest.spans.push(span)
            if (fetch) fullRequest.fetches.push(fetch)
          }
          line = `${JSON.stringify({ version: 1, request: fullRequest } satisfies JournalRecord)}\n`
          updatedSummary = summarizeRequestInsight(fullRequest)
        }
        const byteLength = Buffer.byteLength(line, 'utf8')
        if (this.writer.size > 0 && this.writer.wouldExceed(byteLength)) {
          await this.rotate()
        }
        this.writer.write(Buffer.from(line, 'utf8'))
        this.archives.recordTime(metadata.startTime)
        this.summaries.set(key, {
          sequence: this.summaries.get(key)?.sequence ?? ++this.sequence,
          request: updatedSummary,
        })
      })
      .catch((error) => {
        console.warn('Failed to write Request Insights journal', error)
      })
  }

  private async rotate(): Promise<void> {
    await this.archives.rotate()
    this.summaries.clear()
    this.generation++
    this.truncated = true
    await this.archives.maintain()
  }

  initialize(): Promise<void> {
    return this.run(async () => {
      this.writer.close()
      this.writer.size = await this.archives.scanActiveFile()
      await this.archives.rotate()
      this.sequence = 0
      this.summaries.clear()
      this.sessionId = createSessionId()
      this.generation = 0
      this.truncated = false
      await this.archives.maintain()
      this.startMaintenance()
    })
  }

  configure(): Promise<void> {
    return this.run(async () => {
      this.writer.close()
      this.writer.size = await this.archives.scanActiveFile()
      this.startMaintenance()
    })
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
    this.pendingAppends = undefined
    return this.writes
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
  getJournalRegistry().configured?.appendUpdate(request, update, request)
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

async function readJournalFiles(
  files: string[],
  filter: JournalFilter
): Promise<RequestInsight[]> {
  if (filter.limit !== undefined && filter.limit <= 0) return []
  const matches = new Map<string, RequestInsight>()
  for await (const line of readJournalLines(files)) {
    try {
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
          // Delta metadata must not replace the accumulated trace arrays.
          Object.assign(stored, request, {
            spans: stored.spans,
            fetches: stored.fetches,
          })
          if (record.span) stored.spans.push(record.span)
          if (record.fetch) stored.fetches.push(record.fetch)
        }
      }
    } catch (error) {
      console.warn('Failed to read Request Insights record', error)
    }
  }
  return [...matches.values()]
}

async function* readJournalLines(files: string[]): AsyncGenerator<string> {
  for (const file of files) {
    // Propagate source/gzip errors to readline, with a handler attached immediately.
    const input = createReadStream(file)
    const output = new PassThrough()
    const reading = (
      file.endsWith('.gz')
        ? pipeline(input, createGunzip(), output)
        : pipeline(input, output)
    ).catch(() => {})
    const lines = createInterface({ input: output, crlfDelay: Infinity })
    try {
      yield* lines
    } catch (error) {
      if (!isError(error) || error.code !== 'ENOENT') {
        console.warn('Failed to read Request Insights journal', error)
      }
    } finally {
      lines.close()
      output.destroy()
      input.destroy()
      await reading
    }
  }
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
  const file = path.resolve(distDir, 'request-insights', JOURNAL_FILENAME)
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
