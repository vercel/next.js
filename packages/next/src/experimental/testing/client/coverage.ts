import type { Browser, BrowserContext, CDPSession, Page } from 'playwright'
import type { CompiledBrowserClientTestArtifact } from '../contracts'
import type { CoverageCapture } from '../coverage/types'
import type { BrowserFrameOwner } from '../browser/frame-owner'
import type { ClientEngineBrandFact } from './engine-brand'
import { coverageHash } from '../coverage/artifact'
import { createClientAssetReader } from './assets'
import { assertBrowserCoverageArtifact } from './coverage-artifact'

// Exact owned public serviceWorkers:block initializer from the pinned Playwright
// adapter, including its InitScript wrapper. Bytes alone are insufficient: its
// one script ID must belong to this navigation/main frame, before any asset.
const blockedServiceWorkerInitializer =
  "(() => {\n      \nif (self.ServiceWorkerContainer) ServiceWorkerContainer.prototype.register = async () => { console.warn('Service Worker registration blocked by Playwright'); };\n\n    })();"

// The separately measured SDK 1.61 initializer has the same actual owned
// navigation, full-range count and before-asset ordering requirements.
const sdk161BlockedServiceWorkerInitializer =
  "(() => {\n      \nif (navigator.serviceWorker) navigator.serviceWorker.register = async () => { console.warn('Service Worker registration blocked by Playwright'); };\n\n    })();"

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
  /** Receipt-time inventory before precise capture starts, for the inert host. */
  setup?: boolean
  contextUniqueId?: string
}

/** One owned Chromium target, with all CDP work retained through owner closure. */
export function createClientCoverage(options: {
  artifact: CompiledBrowserClientTestArtifact
  browser: Browser
  context: BrowserContext
  page: Page
  url: string
  /** Private selected child lease and exact inert host URL from createClientServer. */
  frameOwner?: BrowserFrameOwner
  hostURL?: string
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
  const frameOwner = options.frameOwner
  if (
    Boolean(frameOwner) !== Boolean(options.hostURL) ||
    (frameOwner &&
      (frameOwner.engine !== 'chromium' ||
        !options.engineBrandFact ||
        options.hostURL !== `${options.url}host` ||
        new URL(options.hostURL).origin !== origin))
  )
    throw new Error('Browser coverage child-frame owner is invalid.')
  const pending = new Set<Promise<unknown>>()
  const contexts = new Map<number, ExecutionContext>()
  const parsed = new Map<string, ParsedScript>()
  const retiredContexts = new Set<string>()
  const listeners: {
    session: CDPSession
    event: string
    listener: (...args: any[]) => void
  }[] = []
  let pageSession: CDPSession | undefined, targetSession: CDPSession | undefined
  let ownerTarget = '',
    ownerFrame = '',
    hostFrame = '',
    sequence = 0,
    ownedNavigations = 0
  let closing = false,
    closed = false,
    captured = false,
    preciseStarted = false,
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
    if (frameOwner) {
      frameOwner.assertCurrent()
      if (
        (context as BrowserContext & { _guid?: string })._guid !==
          frameOwner.contextGuid ||
        (page as Page & { _guid?: string })._guid !== frameOwner.pageGuid ||
        page.context() !== context ||
        (ownerFrame && frameOwner.nativeFrameId() !== ownerFrame)
      )
        throw new Error(
          'Browser coverage child lease differs from its Page or context.'
        )
    }
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
      (frameOwner
        ? info.url !== options.hostURL
        : info.url !== 'about:blank' && info.url !== options.url)
    )
      throw new Error(
        'Browser coverage observed an uncaptured worker, popup, or target.'
      )
  }
  function assertFrameTree(tree: any, final = false) {
    const root = tree?.frameTree
    const child = root?.childFrames?.[0]
    if (
      !root?.frame?.id ||
      root.frame.id !== hostFrame ||
      root.frame.parentId ||
      root.frame.url !== options.hostURL ||
      root.childFrames?.length !== 1 ||
      child?.frame?.id !== ownerFrame ||
      child.frame.parentId !== hostFrame ||
      child.childFrames?.length ||
      (final
        ? child.frame.url !== options.url || ownedNavigations !== 1
        : child.frame.url !== 'about:blank')
    )
      throw new Error(
        'Browser coverage selected child differs from its actual inert host tree.'
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
      contexts.get(item.id)!.uniqueId !== item.uniqueId &&
      !(frameOwner && retiredContexts.has(contexts.get(item.id)!.uniqueId))
    )
      throw new Error('Browser coverage execution context identity was reused.')
    contexts.set(item.id, item)
    if (frameOwner) {
      if (
        (item.auxData.frameId !== ownerFrame &&
          item.auxData.frameId !== hostFrame) ||
        (preciseStarted && item.auxData.frameId === hostFrame)
      )
        throw new Error('Browser coverage observed an unowned frame realm.')
      return
    }
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
    const execution = contexts.get(value.executionContextId)
    const script: ParsedScript = {
      scriptId: value.scriptId,
      url: value.url,
      executionContextId: value.executionContextId,
      order: sequence++,
      ...(frameOwner
        ? { setup: !preciseStarted, contextUniqueId: execution?.uniqueId }
        : {}),
    }
    parsed.set(script.scriptId, script)
    if (
      frameOwner &&
      preciseStarted &&
      execution?.auxData.frameId !== ownerFrame
    )
      throw new Error(
        'Browser coverage observed new script execution outside its selected child.'
      )
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
          if (frameOwner) {
            hostFrame = tree.frameTree?.frame?.id
            ownerFrame = frameOwner.nativeFrameId()
            target(info.targetInfo)
            assertFrameTree(tree)
          } else ownerFrame = tree.frameTree?.frame?.id
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
            // Browser chrome and tab containers are outside the authored page
            // graph. Every executable target, including workers and popups,
            // must match this exact owner.
            filter: [
              { type: 'browser', exclude: true },
              { type: 'tab', exclude: true },
              { type: 'browser_ui', exclude: true },
              {},
            ],
          })
          listen(pageSession, 'Runtime.executionContextCreated', onContext)
          listen(pageSession, 'Debugger.scriptParsed', onParsed)
          if (frameOwner) {
            listen(
              pageSession,
              'Runtime.executionContextDestroyed',
              (value) => {
                const execution = contexts.get(value.executionContextId)
                if (!execution)
                  throw new Error(
                    'Browser coverage lost an unknown execution realm.'
                  )
                if (
                  execution.auxData.frameId !== ownerFrame ||
                  ownedNavigations > 0 ||
                  (value.executionContextUniqueId &&
                    value.executionContextUniqueId !== execution.uniqueId)
                )
                  throw new Error(
                    'Browser coverage lost its active child or host realm.'
                  )
                retiredContexts.add(execution.uniqueId)
              }
            )
            for (const event of ['Page.frameAttached', 'Page.frameDetached'])
              listen(pageSession, event, () => {
                throw new Error(
                  'Browser coverage selected child topology changed.'
                )
              })
          }
          listen(pageSession, 'Page.frameNavigated', (value) => {
            const frame = value.frame
            if (
              !frame ||
              frame.id !== ownerFrame ||
              (frameOwner ? frame.parentId !== hostFrame : frame.parentId) ||
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
          // Script receipt before this boundary is setup replay from the actual
          // inert host and its about:blank child, never an authored coverage fact.
          preciseStarted = true
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
          if (frameOwner) {
            assertFrameTree(await post(pageSession, 'Page.getFrameTree'), true)
            target((await post(pageSession, 'Target.getTargetInfo')).targetInfo)
          }
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
              (frameOwner &&
                (script.contextUniqueId !== execution.uniqueId ||
                  retiredContexts.has(execution.uniqueId))) ||
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
                (scriptSource !== blockedServiceWorkerInitializer &&
                  scriptSource !== sdk161BlockedServiceWorkerInitializer) ||
                item.functions?.[0]?.ranges?.[0]?.startOffset !== 0 ||
                item.functions?.[0]?.ranges?.[0]?.endOffset !==
                  scriptSource.length ||
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
              !capturedScripts.has(script.scriptId) &&
              !(
                frameOwner &&
                script.setup &&
                script.contextUniqueId &&
                retiredContexts.has(script.contextUniqueId)
              )
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
