import { createReadStream } from 'fs'
import { appendFile, mkdir, stat, writeFile } from 'fs/promises'
import path from 'path'
import { createInterface } from 'readline'
import type { RequestInsight } from '../../../next-devtools/shared/request-insights'
import {
  getRequestInsightTags,
  matchesRequestInsightFilters,
  REQUEST_INSIGHT_FILTERS,
  summarizeRequestInsight,
  type RequestInsightFilter,
  type RequestInsightsHistoryPage,
  type RequestInsightSummary,
} from '../../../next-devtools/shared/request-insights-summary'
import { getRequestInsightKind } from '../../../shared/lib/request-insights'

const JOURNAL_SIZE_LIMIT = 50 * 1024 * 1024
const JOURNAL_FILENAME = 'request-insights.ndjson'
const REQUEST_INSIGHTS_JOURNAL_KEY = Symbol.for(
  `@next/request-insights-journal@${process.env.__NEXT_VERSION}`
)

type JournalRecord = {
  version: 1
  request: RequestInsight
}

type JournalFilter = {
  requestId?: string
  htmlRequestId?: string
  kind?: RequestInsight['kind']
  limit?: number
}

type HistoryFilter = {
  cursor?: string
  filters?: readonly RequestInsightFilter[]
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
  private summaries: IndexedSummary[] = []
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
    this.writes = this.writes
      .then(async () => {
        await this.ensureDirectory()
        if (this.size > 0 && this.size + byteLength > JOURNAL_SIZE_LIMIT) {
          await writeFile(this.file, '')
          this.size = 0
          this.summaries = []
          this.generation++
          this.truncated = true
        }

        await appendFile(this.file, line, 'utf8')
        this.size += byteLength
        this.summaries.push({ sequence: ++this.sequence, request: summary })
      })
      .catch((error) => {
        console.warn('Failed to write Request Insights journal', error)
      })
  }

  async initialize(): Promise<void> {
    await this.flush()
    await this.ensureDirectory()
    await writeFile(this.file, '')
    this.size = 0
    this.sequence = 0
    this.summaries = []
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
    const visible = this.summaries.filter(
      ({ request }) =>
        showInternal || getRequestInsightKind(request) === 'request'
    )
    const optionCounts = Object.fromEntries(
      REQUEST_INSIGHT_FILTERS.map((requestFilter) => [requestFilter, 0])
    ) as Record<RequestInsightFilter, number>
    for (const { request } of this.summaries) {
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

  const matches: RequestInsight[] = []
  try {
    const lines = createInterface({
      input: createReadStream(journal.file, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    })

    for await (const line of lines) {
      const request = parseJournalLine(line)
      if (
        !request ||
        (filter.requestId !== undefined &&
          request.requestId !== filter.requestId) ||
        (filter.htmlRequestId !== undefined &&
          request.htmlRequestId !== filter.htmlRequestId) ||
        (filter.kind !== undefined && request.kind !== filter.kind)
      ) {
        continue
      }

      matches.push(request)
      if (filter.limit !== undefined && matches.length > filter.limit) {
        matches.shift()
      }
    }
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.warn('Failed to read Request Insights journal', error)
    }
  }

  return matches
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

function parseJournalLine(line: string): RequestInsight | undefined {
  try {
    const record = JSON.parse(line) as Partial<JournalRecord>
    const request = record.request
    if (
      record.version !== 1 ||
      !request ||
      typeof request.requestId !== 'string' ||
      typeof request.htmlRequestId !== 'string' ||
      !Array.isArray(request.spans) ||
      !Array.isArray(request.fetches)
    ) {
      return undefined
    }
    return request
  } catch {
    return undefined
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
