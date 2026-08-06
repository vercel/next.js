import type { IncomingMessage } from 'http'
import type { DevBundler } from './router-utils/setup-dev-bundler'
import type { WorkerRequestHandler } from './types'

import { LRUCache } from './lru-cache'
import { createRequestResponseMocks } from './mock-request'
import {
  HMR_MESSAGE_SENT_TO_BROWSER,
  type HmrMessageSentToBrowser,
  type NextJsHotReloaderInterface,
} from '../dev/hot-reloader-types'
import { traceCompileRoute } from '../dev/route-compilation-tracing'
import type { RequestInsights } from './trace/request-insights'
import type {
  RequestInsightsLiveSnapshot,
  RequestInsightsLiveUpdate,
} from '../../next-devtools/shared/request-insights'

type RequestInsightsHmrRuntime = Pick<
  typeof import('../../next-devtools/shared/request-insights'),
  | 'getRequestInsightKey'
  | 'getRequestInsightsSerializedByteLength'
  | 'REQUEST_INSIGHT_RETENTION_BUCKETS'
  | 'REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET'
  | 'REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES'
>

let requestInsightsHmrRuntime: RequestInsightsHmrRuntime | undefined

function getRequestInsightsHmrRuntime(): RequestInsightsHmrRuntime | undefined {
  if (process.env.__NEXT_DEV_SERVER) {
    return (requestInsightsHmrRuntime ??=
      require('../../next-devtools/shared/request-insights') as typeof import('../../next-devtools/shared/request-insights'))
  }
  return undefined
}

type RequestInsightsHmrCoalescerOptions = {
  maxPendingBytes?: number
  maxPendingUpdates?: number
}

/** Coalesces synchronous record mutations and falls back to one full resync. */
export class RequestInsightsHmrCoalescer {
  private readonly pending = new Map<
    string,
    {
      update: RequestInsightsLiveUpdate
      byteLength: number
      firstSequence: number
    }
  >()
  private pendingBytes = 0
  private flushTimer: ReturnType<typeof setTimeout> | undefined
  private requiresResync = false
  private requiresAuthoritativeResync = false
  private closed = false

  constructor(
    private readonly sendUpdate: (update: RequestInsightsLiveUpdate) => void,
    private readonly sendSnapshot: (
      snapshot: RequestInsightsLiveSnapshot,
      authoritative: boolean
    ) => void,
    private readonly getSnapshot: () => RequestInsightsLiveSnapshot,
    private readonly options: RequestInsightsHmrCoalescerOptions = {}
  ) {}

  enqueue(update: RequestInsightsLiveUpdate): void {
    if (this.closed) return
    const runtime = getRequestInsightsHmrRuntime()
    if (!runtime) return
    if (update.requiresResync) {
      this.requireResync()
      return
    }
    if (this.requiresResync) return

    const key = runtime.getRequestInsightKey(update.insight)
    const byteLength = runtime.getRequestInsightsSerializedByteLength(update)
    const previous = this.pending.get(key)
    if (previous) {
      // Sequence sorting must not reorder records relative to their first pending update.
      for (const [pendingKey, pending] of this.pending) {
        if (
          pendingKey !== key &&
          (previous.firstSequence - pending.firstSequence) *
            (update.sequence - pending.update.sequence) <
            0
        ) {
          this.requireResync()
          return
        }
      }
    }
    this.pendingBytes += byteLength - (previous?.byteLength ?? 0)
    this.pending.set(key, {
      update,
      byteLength,
      firstSequence: previous?.firstSequence ?? update.sequence,
    })

    if (
      this.pending.size >
        (this.options.maxPendingUpdates ??
          runtime.REQUEST_INSIGHTS_MAX_GROUPS_PER_RETENTION_BUCKET *
            runtime.REQUEST_INSIGHT_RETENTION_BUCKETS.length) ||
      this.pendingBytes >
        (this.options.maxPendingBytes ??
          runtime.REQUEST_INSIGHTS_MAX_SNAPSHOT_BYTES)
    ) {
      this.requireResync()
      return
    }
    this.scheduleFlush()
  }

  requestResync(authoritative = false): void {
    if (!this.closed) this.requireResync(authoritative)
  }

  close(): void {
    this.closed = true
    if (this.flushTimer) clearTimeout(this.flushTimer)
    this.flushTimer = undefined
    this.pending.clear()
    this.pendingBytes = 0
    this.requiresResync = false
    this.requiresAuthoritativeResync = false
  }

  private requireResync(authoritative = false): void {
    this.pending.clear()
    this.pendingBytes = 0
    this.requiresResync = true
    this.requiresAuthoritativeResync ||= authoritative
    this.scheduleFlush()
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => this.flush(), 0)
    this.flushTimer.unref?.()
  }

  private flush(): void {
    this.flushTimer = undefined
    if (this.closed) return
    if (this.requiresResync) {
      const authoritative = this.requiresAuthoritativeResync
      this.requiresResync = false
      this.requiresAuthoritativeResync = false
      this.pending.clear()
      this.pendingBytes = 0
      this.sendSnapshot(this.getSnapshot(), authoritative)
      return
    }

    const updates = Array.from(this.pending.values())
      .map(({ update }) => update)
      .sort((left, right) => left.sequence - right.sequence)
    this.pending.clear()
    this.pendingBytes = 0
    for (const update of updates) this.sendUpdate(update)
  }
}

/**
 * The DevBundlerService provides an interface to perform tasks with the
 * bundler while in development.
 */
export class DevBundlerService {
  public appIsrManifestInner: InstanceType<typeof LRUCache<boolean>>
  public setCacheStatus: NextJsHotReloaderInterface['setCacheStatus']
  public setReactDebugChannel: NextJsHotReloaderInterface['setReactDebugChannel']
  public sendErrorsToBrowser: NextJsHotReloaderInterface['sendErrorsToBrowser']
  private unsubscribeRequestInsights?: () => void
  private unsubscribeRequestInsightsResync?: () => void
  private requestInsightsHmrCoalescer?: RequestInsightsHmrCoalescer

  constructor(
    private readonly bundler: DevBundler,
    private readonly handler: WorkerRequestHandler,
    public readonly requestInsights: RequestInsights | undefined
  ) {
    this.appIsrManifestInner = new LRUCache(
      8_000,

      function length() {
        return 16
      }
    )

    const { hotReloader } = bundler

    this.setCacheStatus = hotReloader.setCacheStatus.bind(hotReloader)
    this.setReactDebugChannel =
      hotReloader.setReactDebugChannel.bind(hotReloader)
    this.sendErrorsToBrowser = hotReloader.sendErrorsToBrowser.bind(hotReloader)

    if (requestInsights) {
      this.requestInsightsHmrCoalescer = new RequestInsightsHmrCoalescer(
        (update) =>
          hotReloader.send({
            type: HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_INSIGHTS_UPDATE,
            ...update,
          }),
        (snapshot, authoritative) =>
          hotReloader.send({
            type: HMR_MESSAGE_SENT_TO_BROWSER.REQUEST_INSIGHTS_SNAPSHOT,
            snapshot,
            authoritative: authoritative || undefined,
          }),
        () => requestInsights.getLiveSnapshot()
      )
      this.unsubscribeRequestInsights = requestInsights.subscribeLive(
        (update) => this.requestInsightsHmrCoalescer?.enqueue(update)
      )
      this.unsubscribeRequestInsightsResync = requestInsights.subscribeResync(
        (authoritative) =>
          this.requestInsightsHmrCoalescer?.requestResync(authoritative)
      )
    }
  }

  public close: NextJsHotReloaderInterface['close'] = () => {
    this.unsubscribeRequestInsights?.()
    this.unsubscribeRequestInsightsResync?.()
    this.requestInsightsHmrCoalescer?.close()
    this.bundler.hotReloader.close()
  }

  public ensurePage: typeof this.bundler.hotReloader.ensurePage = async (
    definition
  ) => {
    // TODO: remove after ensure is pulled out of server
    return await traceCompileRoute(() =>
      this.bundler.hotReloader.ensurePage(definition)
    )
  }

  public getServerComponentsHmrRefreshHash(): string | undefined {
    return this.bundler.hotReloader.getServerComponentsHmrRefreshHash()
  }

  public logErrorWithOriginalStack =
    this.bundler.logErrorWithOriginalStack.bind(this.bundler)

  public async getFallbackErrorComponents(url?: string) {
    await this.bundler.hotReloader.buildFallbackError()
    // Build the error page to ensure the fallback is built too.
    // TODO: See if this can be moved into hotReloader or removed.
    await this.bundler.hotReloader.ensurePage({
      page: '/_error',
      clientOnly: false,
      definition: undefined,
      url,
    })
  }

  public async getCompilationError(page: string) {
    const errors = await this.bundler.hotReloader.getCompilationErrors(page)
    if (!errors) return

    // Return the very first error we found.
    return errors[0]
  }

  public async revalidate({
    urlPath,
    headers,
    opts: revalidateOpts,
  }: {
    urlPath: string
    headers: IncomingMessage['headers']
    opts: any
  }) {
    const mocked = createRequestResponseMocks({
      url: urlPath,
      headers,
    })

    await this.handler(mocked.req, mocked.res)
    await mocked.res.hasStreamed

    if (
      mocked.res.getHeader('x-nextjs-cache') !== 'REVALIDATED' &&
      mocked.res.statusCode !== 200 &&
      !(mocked.res.statusCode === 404 && revalidateOpts.unstable_onlyGenerated)
    ) {
      throw new Error(`Invalid response ${mocked.res.statusCode}`)
    }

    return {}
  }

  public get appIsrManifest() {
    const serializableManifest: Record<string, boolean> = {}

    for (const [key, value] of this.appIsrManifestInner) {
      serializableManifest[key] = value
    }

    return serializableManifest
  }

  public setIsrStatus(key: string, value: boolean | undefined) {
    if (value === undefined) {
      this.appIsrManifestInner.remove(key)
    } else {
      this.appIsrManifestInner.set(key, value)
    }

    // Only send the ISR manifest to legacy clients, i.e. Pages Router clients,
    // or App Router clients that have Cache Components disabled. The ISR
    // manifest is only used to inform the static indicator, which currently
    // does not provide useful information if Cache Components is enabled due to
    // its binary nature (i.e. it does not support showing info for partially
    // static pages).
    this.bundler?.hotReloader?.sendToLegacyClients({
      type: HMR_MESSAGE_SENT_TO_BROWSER.ISR_MANIFEST,
      data: this.appIsrManifest,
    })
  }

  public sendHmrMessage(message: HmrMessageSentToBrowser) {
    this.bundler.hotReloader.send(message)
  }
}
