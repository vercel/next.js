import type { Browser, BrowserContext, CDPSession, Page } from 'playwright'
import type { CompiledBrowserClientTestArtifact } from '../contracts'
import type { CoverageCapture } from '../coverage/types'
import type { ClientEngineBrandFact } from './engine-brand'
import { coverageHash } from '../coverage/artifact'
import { createClientAssetReader } from './assets'
import { assertBrowserCoverageArtifact } from './coverage-artifact'

// Exact owned public serviceWorkers:block initializer from the pinned Playwright
// adapter, including its InitScript wrapper. Bytes alone are insufficient: its
// one script ID must belong to this navigation/main frame, before any asset.
const blockedServiceWorkerInitializer =
  "(() => {\n      \nif (self.ServiceWorkerContainer) ServiceWorkerContainer.prototype.register = async () => { console.warn('Service Worker registration blocked by Playwright'); };\n\n    })();"

interface ExecutionContext {
  id: number
  uniqueId: string
  origin: string
  auxData: { isDefault: boolean; type: string; frameId: string }
}
interface ParsedScript {
  scriptId: string
  url: string
  executionContextId: number
  order: number
}

/** One owned Chromium target, with all CDP work retained through owner closure. */
export function createClientCoverage(options: {
  artifact: CompiledBrowserClientTestArtifact
  browser: Browser
  context: BrowserContext
  page: Page
  url: string
  /** Issued by this parent's actual newContext call, never by browser RPC. */
  contextOptions: { serviceWorkers: 'block' }
  /** Live parent-owned debugger registration, never artifact or browser RPC data. */
  engineBrandFact?: () => Readonly<ClientEngineBrandFact>
  signal: AbortSignal
  onFailure(error: unknown): void
}) {
  const { artifact, browser, context, page, signal } = options
  if (artifact.coverage?.sourceAnalysis)
    throw new Error(
      'Compile-only coverage sources cannot enter runtime capture'
    )
  const origin = new URL(options.url).origin
  const pending = new Set<Promise<unknown>>()
  const contexts = new Map<number, ExecutionContext>()
  const parsed = new Map<string, ParsedScript>()
  const listeners: {
    session: CDPSession
    event: string
    listener: (...args: any[]) => void
  }[] = []
  let pageSession: CDPSession | undefined, targetSession: CDPSession | undefined
  let ownerTarget = '',
    ownerFrame = '',
    sequence = 0,
    ownedNavigations = 0
  let closing = false,
    closed = false,
    captured = false,
    failure: unknown
  let capture: CoverageCapture | undefined
  let reader: Awaited<ReturnType<typeof createClientAssetReader>> | undefined
  function fail(error: unknown) {
    if (failure) return
    failure = error
    try {
      options.onFailure(error)
    } catch (observerError) {
      failure = new AggregateError(
        [error, observerError],
        'Browser coverage failure observer failed.'
      )
    }
  }
  function track<T>(operation: Promise<T>): Promise<T> {
    const task = operation.finally(() => pending.delete(task))
    pending.add(task)
    task.catch(() => {})
    return task
  }
  function assertOpen() {
    signal.throwIfAborted()
    if (closing || closed) throw new Error('Browser coverage owner is closed.')
    if (failure) throw failure
  }
  function post(
    session: CDPSession,
    method: string,
    params: object = {}
  ): Promise<any> {
    assertOpen()
    return track(session.send(method as any, params))
  }
  function listen(
    session: CDPSession,
    event: string,
    listener: (...args: any[]) => void
  ) {
    const guarded = (...args: any[]) => {
      try {
        listener(...args)
      } catch (error) {
        fail(error)
      }
    }
    session.on(event as any, guarded)
    listeners.push({ session, event, listener: guarded })
  }
  function assetPath(url: string) {
    const actual = new URL(url)
    if (
      actual.origin !== origin ||
      actual.search ||
      actual.hash ||
      !actual.pathname.startsWith('/_next/')
    )
      throw new Error('Browser coverage script escaped its owned asset origin.')
    const file = actual.pathname
      .slice('/_next/'.length)
      .split('/')
      .map(decodeURIComponent)
      .join('/')
    const expected = new URL(
      `/_next/${file.split('/').map(encodeURIComponent).join('/')}`,
      origin
    ).href
    if (
      expected !== actual.href ||
      !artifact.coverage!.scripts.some((script) => script.path === file)
    )
      throw new Error(
        'Browser coverage script is outside its compiler-issued allowlist.'
      )
    return file
  }
  function target(info: any) {
    if (
      !info ||
      info.targetId !== ownerTarget ||
      info.type !== 'page' ||
      (info.url !== 'about:blank' && info.url !== options.url)
    )
      throw new Error(
        'Browser coverage observed an uncaptured worker, popup, or target.'
      )
  }
  function onContext(value: any) {
    const item = value?.context as ExecutionContext
    if (
      !item ||
      !Number.isSafeInteger(item.id) ||
      !item.uniqueId ||
      typeof item.origin !== 'string' ||
      !item.auxData ||
      typeof item.auxData.isDefault !== 'boolean' ||
      !item.auxData.frameId
    )
      throw new Error('Browser coverage received an invalid execution context.')
    if (
      contexts.has(item.id) &&
      contexts.get(item.id)!.uniqueId !== item.uniqueId
    )
      throw new Error('Browser coverage execution context identity was reused.')
    contexts.set(item.id, item)
    if (
      item.auxData.isDefault &&
      item.origin === origin &&
      item.auxData.frameId !== ownerFrame
    )
      throw new Error('Browser coverage observed an unowned frame.')
  }
  function onParsed(value: any) {
    if (
      !value ||
      typeof value.scriptId !== 'string' ||
      !value.scriptId ||
      typeof value.url !== 'string' ||
      !Number.isSafeInteger(value.executionContextId) ||
      parsed.has(value.scriptId)
    )
      throw new Error(
        'Browser coverage received an invalid or repeated script identity.'
      )
    const script = {
      scriptId: value.scriptId,
      url: value.url,
      executionContextId: value.executionContextId,
      order: sequence++,
    }
    parsed.set(script.scriptId, script)
    if (captured && contexts.get(script.executionContextId)?.origin === origin)
      throw new Error(
        'Browser coverage observed a script after its final capture.'
      )
  }
  return {
    start() {
      return track(
        (async () => {
          assertOpen()
          if (pageSession || options.contextOptions.serviceWorkers !== 'block')
            throw new Error('Browser coverage initialization owner is invalid.')
          await assertBrowserCoverageArtifact(artifact)
          reader = await createClientAssetReader(artifact)
          assertOpen()
          pageSession = await track(context.newCDPSession(page))
          assertOpen()
          const info = await post(pageSession, 'Target.getTargetInfo')
          if (!info.targetInfo?.targetId || info.targetInfo.type !== 'page')
            throw new Error(
              'Browser coverage requires its actual Chromium page target.'
            )
          ownerTarget = info.targetInfo.targetId
          const tree = await post(pageSession, 'Page.getFrameTree')
          ownerFrame = tree.frameTree?.frame?.id
          if (!ownerFrame)
            throw new Error('Browser coverage requires its actual main frame.')
          targetSession = await track(browser.newBrowserCDPSession())
          assertOpen()
          listen(targetSession, 'Target.targetCreated', (value) =>
            target(value.targetInfo)
          )
          listen(targetSession, 'Target.targetInfoChanged', (value) =>
            target(value.targetInfo)
          )
          await post(targetSession, 'Target.setDiscoverTargets', {
            discover: true,
            // Browser/tab containers execute no page scripts. Every executable
            // target, including workers and popups, must match this exact owner.
            filter: [
              { type: 'browser', exclude: true },
              { type: 'tab', exclude: true },
              {},
            ],
          })
          listen(pageSession, 'Runtime.executionContextCreated', onContext)
          listen(pageSession, 'Debugger.scriptParsed', onParsed)
          listen(pageSession, 'Page.frameNavigated', (value) => {
            const frame = value.frame
            if (
              !frame ||
              frame.id !== ownerFrame ||
              frame.parentId ||
              (frame.url !== 'about:blank' && frame.url !== options.url) ||
              (frame.url === 'about:blank' && ownedNavigations > 0) ||
              (frame.url === options.url && ++ownedNavigations !== 1)
            )
              throw new Error(
                'Browser coverage observed an unowned navigation.'
              )
          })
          await post(pageSession, 'Page.enable')
          await post(pageSession, 'Runtime.enable')
          await post(pageSession, 'Debugger.enable')
          await post(pageSession, 'Profiler.enable')
          await post(pageSession, 'Profiler.startPreciseCoverage', {
            callCount: true,
            detailed: true,
          })
          assertOpen()
        })()
      )
    },
    take() {
      return track(
        (async () => {
          assertOpen()
          if (!pageSession || !reader || captured)
            throw new Error('Browser coverage has no live capture owner.')
          await assertBrowserCoverageArtifact(artifact)
          const issuedEngineFact = options.engineBrandFact?.()
          const engineFact =
            issuedEngineFact && Object.freeze({ ...issuedEngineFact })
          if (
            engineFact &&
            (typeof engineFact.source !== 'string' ||
              !engineFact.source ||
              typeof engineFact.url !== 'string' ||
              !engineFact.url ||
              typeof engineFact.scriptId !== 'string' ||
              !engineFact.scriptId ||
              !Number.isSafeInteger(engineFact.executionContextId) ||
              typeof engineFact.contextUniqueId !== 'string' ||
              !engineFact.contextUniqueId ||
              typeof engineFact.frameId !== 'string' ||
              !engineFact.frameId)
          )
            throw new Error(
              'Browser coverage received an invalid parent engine initializer fact.'
            )
          const raw = await post(pageSession, 'Profiler.takePreciseCoverage')
          captured = true
          if (!Array.isArray(raw.result))
            throw new Error('Missing Chromium precise coverage results.')
          const scripts: CoverageCapture['scripts'] = [],
            seen = new Set<string>(),
            capturedScripts = new Set<string>()
          const ownedContexts = new Set<string>()
          let initializer: ParsedScript | undefined,
            engineInitializer: ParsedScript | undefined
          let firstAssetOrder = Infinity
          for (const item of raw.result) {
            const script = parsed.get(item.scriptId),
              execution = script && contexts.get(script.executionContextId)
            if (
              !script ||
              !execution ||
              !execution.auxData.isDefault ||
              execution.auxData.type !== 'default' ||
              execution.origin !== origin ||
              execution.auxData.frameId !== ownerFrame
            )
              throw new Error(
                'Browser coverage cannot attribute a script to its owned default realm.'
              )
            capturedScripts.add(script.scriptId)
            ownedContexts.add(execution.uniqueId)
            const { scriptSource } = await post(
              pageSession,
              'Debugger.getScriptSource',
              { scriptId: script.scriptId }
            )
            if (typeof scriptSource !== 'string')
              throw new Error('Missing Chromium script source.')
            if (engineFact && script.scriptId === engineFact.scriptId) {
              if (
                engineInitializer ||
                script.url !== engineFact.url ||
                script.executionContextId !== engineFact.executionContextId ||
                execution.uniqueId !== engineFact.contextUniqueId ||
                execution.auxData.frameId !== engineFact.frameId ||
                scriptSource !== engineFact.source ||
                coverageHash(scriptSource) !==
                  coverageHash(engineFact.source) ||
                item.functions?.[0]?.ranges?.[0]?.startOffset !== 0 ||
                item.functions?.[0]?.ranges?.[0]?.endOffset !==
                  engineFact.source.length ||
                item.functions?.[0]?.ranges?.[0]?.count !== 1
              )
                throw new Error(
                  'Browser coverage engine initializer differs from its parent debugger registration.'
                )
              engineInitializer = script
              continue
            }
            if (!script.url) {
              if (
                initializer ||
                scriptSource !== blockedServiceWorkerInitializer ||
                item.functions?.[0]?.ranges?.[0]?.startOffset !== 0 ||
                item.functions?.[0]?.ranges?.[0]?.endOffset !==
                  blockedServiceWorkerInitializer.length ||
                item.functions?.[0]?.ranges?.[0]?.count !== 1
              )
                throw new Error(
                  'Browser coverage observed an unqualified anonymous script.'
                )
              initializer = script
              continue
            }
            const file = assetPath(script.url)
            if (seen.has(file))
              throw new Error(
                'Browser coverage observed a duplicate emitted script.'
              )
            seen.add(file)
            firstAssetOrder = Math.min(firstAssetOrder, script.order)
            const bytes = await reader.read(file)
            if (coverageHash(scriptSource) !== coverageHash(bytes))
              throw new Error(
                'Browser coverage loaded script differs from native emitted bytes.'
              )
            if (!Array.isArray(item.functions) || !item.functions.length)
              throw new Error(
                'Browser coverage omitted actual V8 function ranges.'
              )
            scripts.push({
              path: file,
              sha256: coverageHash(bytes),
              functions: structuredClone(item.functions),
            })
          }
          for (const script of parsed.values()) {
            const execution = contexts.get(script.executionContextId)
            if (
              execution?.auxData.isDefault &&
              execution.auxData.type === 'default' &&
              execution.origin === origin &&
              execution.auxData.frameId === ownerFrame &&
              !capturedScripts.has(script.scriptId)
            )
              throw new Error(
                'Browser coverage omitted a loaded script from its owned realm.'
              )
          }
          if (
            ownedContexts.size !== 1 ||
            !initializer ||
            initializer.order >= firstAssetOrder ||
            artifact.client.scripts.some((file) => !seen.has(file))
          )
            throw new Error(
              'Browser coverage did not observe one coherent native entry and initializer.'
            )
          if (
            engineFact &&
            (!engineInitializer || engineInitializer.order >= firstAssetOrder)
          )
            throw new Error(
              'Browser coverage did not observe its registered engine initializer before authored assets.'
            )
          const assertEngineRegistration = () => {
            if (!engineFact) return
            // The issuer must still be live after all awaited capture work. Closing,
            // abort or registration replacement vetoes this capture before sealing.
            const current = options.engineBrandFact!()
            if (
              current.source !== engineFact.source ||
              current.url !== engineFact.url ||
              current.scriptId !== engineFact.scriptId ||
              current.executionContextId !== engineFact.executionContextId ||
              current.contextUniqueId !== engineFact.contextUniqueId ||
              current.frameId !== engineFact.frameId
            )
              throw new Error(
                'Browser coverage parent engine initializer registration changed during capture.'
              )
          }
          assertEngineRegistration()
          await post(pageSession, 'Profiler.stopPreciseCoverage')
          await post(pageSession, 'Profiler.disable')
          await post(pageSession, 'Debugger.disable')
          await post(pageSession, 'Runtime.disable')
          await post(pageSession, 'Page.disable')
          await post(targetSession!, 'Target.setDiscoverTargets', {
            discover: false,
          })
          await track(pageSession.detach())
          await track(targetSession!.detach())
          await assertBrowserCoverageArtifact(artifact)
          assertOpen()
          assertEngineRegistration()
          capture = { version: 1, kind: 'browser-cdp', scripts }
        })()
      )
    },
    /** Call before initiating realm disposal, including cancellation paths. */
    close() {
      closing = true
    },
    /** The caller has awaited context, browser connection, and browser host closure. */
    async afterOwnersClosed() {
      closing = true
      while (pending.size) await Promise.allSettled([...pending])
      for (const { session, event, listener } of listeners)
        session.removeListener(event as any, listener)
      closed = true
    },
    async result() {
      if (!closed || pending.size || failure || signal.aborted || !capture)
        throw (
          failure ||
          signal.reason ||
          new Error(
            'Browser coverage owner did not close with a complete capture.'
          )
        )
      await assertBrowserCoverageArtifact(artifact)
      return capture
    },
  }
}
