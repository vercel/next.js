import type { FirefoxFrameOwner } from './firefox-host'
import type { BrowserContext, Page } from 'playwright'
import type { ClientEngineBrandFact } from '../client/engine-brand'
import type { FirefoxPageOwner, FirefoxRdpPacket } from './firefox-host'
import {
  firefoxNativeHookSource,
  type FirefoxNativeHook,
} from './firefox-native-hook'

/** The source is issued by the same factory as the Chromium initializer. */
export interface FirefoxEngineInitializer {
  source: string
  url: string
  classificationLine: number
  registrationLine: number
}

interface Target {
  actor: string
  threadActor: string
  browsingContextID: number
  innerWindowId: number
  isTopLevelTarget: boolean
  url: string
}

/** A realm-owned native Gecko hook publishes each decision synchronously. */
export function createFirefoxEngineBrand(options: {
  context: BrowserContext
  page: Page
  owner: FirefoxPageOwner
  frameOwner?: FirefoxFrameOwner
  initializer: FirefoxEngineInitializer
  url: string
  signal: AbortSignal
  onFailure(error: unknown): void
}) {
  const { owner, initializer } = options
  const origin = new URL(options.url).origin
  const targets = new Map<string, Target>()
  const facts = new Map<number, ClientEngineBrandFact>()
  const pending = new Set<Promise<unknown>>()
  const removers: (() => void)[] = []
  const cleanupErrors: unknown[] = []
  const hooks = new Set<FirefoxNativeHook>()
  const retiredWindows = new Set<string>()
  const retiredTargets = new Set<string>()
  let removeRetirement: (() => void) | undefined
  const windowKey = (target: string, realm: number) =>
    JSON.stringify([target, realm])
  const setupLifetime = new AbortController()
  let actualSource: string | undefined
  let registrationLine = -1
  let watcher: string | undefined
  let breakpoints: string | undefined
  let browsingContextID: number | undefined
  let fact: ClientEngineBrandFact | undefined
  let failure: unknown
  let closing = false
  let started = false
  let disposal: Promise<void> | undefined
  let transportClosed = false
  function track<T>(operation: Promise<T>): Promise<T> {
    const task = operation.finally(() => pending.delete(task))
    pending.add(task)
    task.catch(() => {})
    return task
  }
  function assertOpen() {
    options.signal.throwIfAborted()
    if (closing || options.page.isClosed())
      throw new Error('Firefox engine classifier is closed.')
    owner.assertCurrent()
    options.frameOwner?.assertCurrent()
    if (failure) throw failure
  }
  function fail(error: unknown) {
    if (failure || closing) return
    failure = error
    try {
      options.onFailure(error)
    } catch (observerError) {
      failure = new AggregateError(
        [error, observerError],
        'Engine classifier failure observer failed.'
      )
    }
  }
  function post(to: string, type: string, fields: object = {}) {
    assertOpen()
    return track(owner.rdp.request(to, type, fields))
  }
  async function nativeHook(
    hook: FirefoxNativeHook,
    operation: 'install' | 'close',
    signal: AbortSignal
  ) {
    signal.throwIfAborted()
    const session = await owner.openNativeSession(signal)
    const events = new Map<string, FirefoxRdpPacket>()
    const waiting = new Map<
      string,
      {
        resolve(packet: FirefoxRdpPacket): void
        reject(error: unknown): void
      }
    >()
    let unavailable: unknown
    function reject(error: unknown) {
      unavailable = error
      for (const entry of waiting.values()) entry.reject(error)
      waiting.clear()
    }
    const removePacket = session.onPacket((packet) => {
      if (packet.type === 'evaluationResult') {
        const key = packet.from + '#' + packet.resultID
        events.set(key, packet)
        waiting.get(key)?.resolve(packet)
      }
      return false
    })
    const removeClosed = session.onClosed(reject)
    const abort = () => {
      reject(signal.reason)
      void session.dispose().catch(() => {})
    }
    signal.addEventListener('abort', abort, { once: true })
    async function evaluate(actor: string, text: string) {
      signal.throwIfAborted()
      const reply = await session.request(actor, 'evaluateJSAsync', {
        text,
        options: {},
      })
      // A method reply only supplies resultID; the matching event owns the
      // completed evaluation, and may already have arrived before that reply.
      signal.throwIfAborted()
      if (unavailable) throw unavailable
      const key = actor + '#' + reply.resultID
      const result =
        events.get(key) ??
        (await new Promise<FirefoxRdpPacket>((resolve, rejectResult) => {
          waiting.set(key, { resolve, reject: rejectResult })
        }))
      waiting.delete(key)
      events.delete(key)
      signal.throwIfAborted()
      if (result.exception || typeof result.result !== 'string')
        throw new Error('Firefox native hook system evaluation failed.')
      return JSON.parse(result.result)
    }
    try {
      signal.throwIfAborted()
      const processes = await session.request('root', 'listProcesses')
      const source = firefoxNativeHookSource(hook, operation)
      for (const descriptor of processes.processes ?? []) {
        signal.throwIfAborted()
        if (descriptor.isParent) continue
        const acquired = await session.request(descriptor.actor, 'getTarget')
        if (typeof acquired.process?.consoleActor !== 'string') continue
        const result = await evaluate(acquired.process.consoleActor, source)
        if (result.found) {
          if (operation === 'install' && result.installed !== true)
            throw new Error('Firefox native hook installation did not finish.')
          if (
            operation === 'close' &&
            !result.alreadyClosed &&
            (result.closed !== true ||
              result.disabled !== true ||
              result.debuggees !== 0 ||
              result.restored !== true)
          )
            throw new Error('Firefox native hook cleanup did not finish.')
          return result
        }
      }
      if (operation === 'install')
        throw new Error(
          'Firefox native hook has no actual owned process target.'
        )
      // A destroyed target has already disabled its realm-owned native hook.
    } finally {
      signal.removeEventListener('abort', abort)
      removePacket()
      removeClosed()
      await session.dispose()
    }
  }
  async function resume(thread: string) {
    // This path also runs after abort/close, before the browser owner shuts down.
    await owner.rdp.request(thread, 'resume').catch(() => {})
  }
  async function paused(packet: FirefoxRdpPacket, target: Target) {
    try {
      if (closing || options.signal.aborted || failure) return
      owner.assertCurrent()
      const frame = packet.frame
      if (!frame?.where || typeof frame.where.actor !== 'string') return
      const issued = facts.get(target.innerWindowId)
      if (!issued && frame.where.line === registrationLine) {
        if (
          (options.frameOwner
            ? target.browsingContextID !==
                options.frameOwner.browsingContextId() &&
              target.browsingContextID !== browsingContextID
            : target.browsingContextID !== browsingContextID ||
              !target.isTopLevelTarget) ||
          new URL(target.url).origin !== origin ||
          !Number.isSafeInteger(target.innerWindowId) ||
          target.innerWindowId <= 0
        )
          return
        const source = await post(frame.where.actor, 'source')
        if (typeof actualSource !== 'string' || source.source !== actualSource)
          return
        assertOpen()
        if (typeof frame.actor !== 'string')
          throw new Error('Firefox native hook registration frame is missing.')
        const hook: FirefoxNativeHook = {
          target: target.actor,
          frame: frame.actor,
          realm: target.innerWindowId,
          browserId: owner.browserId(),
          source: actualSource,
          token: initializer.url,
          ...(options.frameOwner
            ? {
                frameBrowsingContextId: options.frameOwner.browsingContextId(),
                parentBrowsingContextId: browsingContextID,
              }
            : {}),
        }
        // Retain the resource before setup starts: an interrupted evaluation
        // may install it before its result is delivered to this parent.
        hooks.add(hook)
        const installed = await nativeHook(
          hook,
          'install',
          setupLifetime.signal
        )
        assertOpen()
        if (options.frameOwner) {
          if (
            !Number.isSafeInteger(installed?.realm) ||
            installed.realm <= 0 ||
            installed.browsingContextId !==
              options.frameOwner.browsingContextId()
          )
            throw new Error(
              'Firefox native hook returned a different test realm.'
            )
          hook.selectedRealm = installed.realm
        }
        const actualRealm = hook.selectedRealm ?? target.innerWindowId
        if (
          retiredTargets.has(hook.target) ||
          retiredWindows.has(windowKey(hook.target, actualRealm))
        )
          return
        const current: ClientEngineBrandFact = {
          source: initializer.source,
          url: initializer.url,
          scriptId: frame.where.actor,
          executionContextId: actualRealm,
          contextUniqueId: target.actor,
          frameId: String(
            options.frameOwner?.browsingContextId() ?? target.browsingContextID
          ),
        }
        facts.set(actualRealm, current)
        fact = current
        return
      }
      // Classifications run entirely in the synchronous native hook. Unknown
      // authored/SDK debugger statements never receive a remote decision.
    } catch (error) {
      fail(error)
    } finally {
      await resume(packet.from)
    }
  }
  function retire(hook: FirefoxNativeHook, realm: number, clean: boolean) {
    retiredWindows.add(windowKey(hook.target, realm))
    facts.delete(realm)
    if (
      fact?.executionContextId === realm &&
      fact.contextUniqueId === hook.target
    )
      fact = undefined
    if (clean) hooks.delete(hook)
  }
  function retirement(packet: FirefoxRdpPacket): boolean {
    if (
      packet.type === 'next-test-native-hook-window-closed' ||
      packet.type === 'next-test-native-hook-failure'
    ) {
      const hook = [...hooks].find(
        (item) =>
          item.target === packet.from &&
          item.token === packet.token &&
          item.frame === packet.frame &&
          (item.selectedRealm === undefined
            ? item.frameBrowsingContextId !== undefined ||
              item.realm === packet.realm
            : item.selectedRealm === packet.realm)
      )
      if (!hook || !Number.isSafeInteger(packet.realm) || packet.realm <= 0)
        return false
      if (packet.type === 'next-test-native-hook-failure') {
        const error = new Error(
          'Firefox native classifier failed: ' + packet.message
        )
        if (closing) cleanupErrors.push(error)
        else fail(error)
      } else {
        const clean =
          packet.closed === true &&
          packet.disabled === true &&
          packet.debuggees === 0 &&
          packet.restored === true
        retire(hook, packet.realm, clean)
        if (!clean) {
          const error = new Error(
            'Firefox native selected-window cleanup did not finish.'
          )
          cleanupErrors.push(error)
          fail(error)
        }
      }
    } else if (
      packet.type === 'target-destroyed-form' &&
      packet.from === watcher &&
      typeof packet.target?.actor === 'string'
    ) {
      for (const hook of hooks) {
        if (hook.target !== packet.target.actor) continue
        retiredTargets.add(hook.target)
        retire(hook, hook.selectedRealm ?? hook.realm, true)
      }
    }
    return false
  }
  function receive(packet: FirefoxRdpPacket): boolean {
    if (packet.type === 'target-available-form' && packet.from === watcher) {
      const target = packet.target as Target
      if (
        (options.frameOwner
          ? target?.browsingContextID ===
              options.frameOwner.browsingContextId() ||
            target?.browsingContextID === browsingContextID
          : target?.isTopLevelTarget) &&
        typeof target.actor === 'string' &&
        (options.frameOwner ||
          target.browsingContextID === browsingContextID) &&
        typeof target.threadActor === 'string'
      )
        targets.set(target.threadActor, target)
    } else if (
      packet.type === 'target-destroyed-form' &&
      packet.from === watcher
    ) {
      const thread = packet.target?.threadActor
      if (typeof thread === 'string') targets.delete(thread)
    } else if (packet.type === 'paused') {
      const target = targets.get(packet.from)
      if (!target) return false
      void track(paused(packet, target)).catch(fail)
      return true
    }
    return false
  }
  function close() {
    if (disposal) return disposal
    closing = true
    setupLifetime.abort(new Error('Firefox native classifier is closing.'))
    options.signal.removeEventListener('abort', onAbort)
    for (const remove of removers) remove()
    disposal = (async () => {
      await Promise.allSettled([...targets.keys()].map(resume))
      while (pending.size) await Promise.allSettled([...pending])
      if (!options.page.isClosed()) {
        for (const hook of hooks.values()) {
          try {
            await nativeHook(hook, 'close', new AbortController().signal)
          } catch (error) {
            if (!options.page.isClosed()) cleanupErrors.push(error)
          }
        }
      }
      if (breakpoints && !transportClosed) {
        try {
          await owner.rdp.request(breakpoints, 'removeBreakpoint', {
            location: {
              sourceUrl: initializer.url,
              line: registrationLine,
              column: 1,
            },
          })
        } catch (error) {
          if (!options.page.isClosed()) cleanupErrors.push(error)
        }
      }
      removeRetirement?.()
      removeRetirement = undefined
    })()
    disposal.catch(() => {})
    return disposal
  }
  const onAbort = () => close()
  return {
    start() {
      return track(
        (async () => {
          assertOpen()
          if (started)
            throw new Error('Firefox engine classifier cannot start twice.')
          started = true
          options.signal.addEventListener('abort', onAbort, { once: true })
          removeRetirement = owner.rdp.onPacket(retirement)
          removers.push(
            owner.rdp.onPacket(receive),
            owner.rdp.onClosed((error) => {
              transportClosed = true
              fail(error)
            })
          )
          await track(
            options.page.addInitScript({ content: initializer.source })
          )
          assertOpen()
          actualSource = owner.initializerSource(initializer.source)
          const offset = actualSource.indexOf(initializer.source)
          if (
            offset < 0 ||
            actualSource.lastIndexOf(initializer.source) !== offset
          )
            throw new Error(
              'Firefox initializer source has no unique actual script.'
            )
          const firstLine = actualSource.slice(0, offset).split('\n').length
          registrationLine = firstLine + initializer.registrationLine
          if (registrationLine <= 0)
            throw new Error(
              'Firefox initializer source lost its actual pause locations.'
            )
          const tabs = await post('root', 'listTabs')
          const matches = tabs.tabs?.filter(
            (tab: any) => tab.browserId === owner.browserId()
          )
          if (
            matches?.length !== 1 ||
            typeof matches[0].actor !== 'string' ||
            !Number.isSafeInteger(matches[0].browsingContextID)
          )
            throw new Error(
              'Firefox debugger tab differs from its actual SDK page.'
            )
          browsingContextID = matches[0].browsingContextID
          const acquired = await post(matches[0].actor, 'getWatcher', {
            isServerTargetSwitchingEnabled: true,
          })
          if (typeof acquired.actor !== 'string')
            throw new Error('Firefox classifier has no actual target watcher.')
          watcher = acquired.actor
          // A debugger-owned highlighter changes layout and native hit targets.
          // Store this on the watcher before it attaches current/future threads.
          const configuration = (
            await post(watcher, 'getThreadConfigurationActor')
          ).configuration
          const threadConfiguration =
            typeof configuration === 'string'
              ? configuration
              : configuration?.actor
          if (!threadConfiguration)
            throw new Error(
              'Firefox watcher has no thread configuration owner.'
            )
          await post(threadConfiguration, 'updateConfiguration', {
            configuration: { pauseOverlay: false },
          })
          await post(watcher, 'watchTargets', { targetType: 'frame' })
          const list = (await post(watcher, 'getBreakpointListActor'))
            .breakpointList
          breakpoints = typeof list === 'string' ? list : list?.actor
          if (!breakpoints)
            throw new Error('Firefox watcher has no breakpoint owner.')
          await post(breakpoints, 'setBreakpoint', {
            location: {
              sourceUrl: initializer.url,
              line: registrationLine,
              column: 1,
            },
            options: {},
          })
          assertOpen()
        })()
      )
    },
    fact(): Readonly<ClientEngineBrandFact> {
      assertOpen()
      if (!fact)
        throw new Error('Firefox engine classifier was never authenticated.')
      return { ...fact }
    },
    close,
    async afterOwnersClosed() {
      close()
      await disposal
      while (pending.size) await Promise.allSettled([...pending])
      targets.clear()
      facts.clear()
      hooks.clear()
      retiredWindows.clear()
      retiredTargets.clear()
      if (cleanupErrors.length)
        throw new AggregateError(
          cleanupErrors,
          'Firefox engine classifier cleanup failed.'
        )
    },
  }
}
