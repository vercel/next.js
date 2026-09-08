import { createReadStream } from 'fs'
import { appendFile, mkdir, stat, writeFile } from 'fs/promises'
import path from 'path'
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

const JOURNAL_SIZE_LIMIT = 50 * 1024 * 1024
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

type JournalCursor = {
  sessionId: string
  generation: number
  beforeSequence: number
}

class RequestInsightsJournal {
  private writes = Promise.resolve()
  private size = 0
  private sequence = 0
  private summaries = new Map<string, IndexedSummary>()
  private pendingRequests = new Set<string>()
  private sessionId = createSessionId()
  private generation = 0
  private truncated = false

  constructor(readonly file: string) {}

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
    this.writes = this.writes
      .then(async () => {
        await this.ensureDirectory()
        if (this.size > 0 && this.size + byteLength > JOURNAL_SIZE_LIMIT) {
          await this.rotate()
        }

        await appendFile(this.file, line, 'utf8')
        this.size += byteLength
        this.summaries.set(key, { sequence: ++this.sequence, request: summary })
      })
      .catch((error) => {
        console.warn('Failed to write Request Insights journal', error)
      })
      .finally(() => this.pendingRequests.delete(key))
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
          archived = (await readJournalFile(this.file, filter))[0]
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
          archived ??= snapshot ?? (await readJournalFile(this.file, filter))[0]
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
          this.size + Buffer.byteLength(line, 'utf8') > JOURNAL_SIZE_LIMIT
        ) {
          let fullRequest: RequestInsight
          if (snapshot) {
            fullRequest = {
              ...snapshot,
              spans: snapshot.spans.slice(0, spanCount),
              fetches: snapshot.fetches.slice(0, fetchCount),
            }
          } else {
            archived ??= (await readJournalFile(this.file, filter))[0]
            if (!archived) return
            fullRequest = { ...archived, ...metadata }
            if (span) fullRequest.spans.push(span)
            if (fetch) fullRequest.fetches.push(fetch)
          }
          line = `${JSON.stringify({ version: 1, request: fullRequest } satisfies JournalRecord)}\n`
          updatedSummary = summarizeRequestInsight(fullRequest)
        }
        const byteLength = Buffer.byteLength(line, 'utf8')
        await this.ensureDirectory()
        if (this.size > 0 && this.size + byteLength > JOURNAL_SIZE_LIMIT) {
          await this.rotate()
        }
        await appendFile(this.file, line, 'utf8')
        this.size += byteLength
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
    await writeFile(this.file, '')
    this.size = 0
    this.summaries.clear()
    this.generation++
    this.truncated = true
  }

  async initialize(): Promise<void> {
    await this.flush()
    await this.ensureDirectory()
    await writeFile(this.file, '')
    this.size = 0
    this.sequence = 0
    this.summaries.clear()
    this.sessionId = createSessionId()
    this.generation = 0
    this.truncated = false
  }

  async configure(): Promise<void> {
    await this.ensureDirectory()
    try {
      this.size = (await stat(this.file)).size
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
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
    return this.writes
  }

  private async ensureDirectory(): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true })
  }
}

export class StaleRequestInsightsHistoryCursorError extends Error {}

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
  const journal = getOrCreateRequestInsightsJournal(distDir)
  await journal.flush()
  return readJournalFile(journal.file, filter)
}

async function readJournalFile(
  file: string,
  filter: JournalFilter
): Promise<RequestInsight[]> {
  if (filter.limit !== undefined && filter.limit <= 0) return []
  const matches = new Map<string, RequestInsight>()
  try {
    const lines = createInterface({
      input: createReadStream(file, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    })

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
    [...registry.journals.values()].map((journal) => journal.flush())
  )
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
