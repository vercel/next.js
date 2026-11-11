import type { ClientEngineBrandFact } from '../client/engine-brand'
import type { WebKitPageOwner } from './webkit-host'
import type { BrowserFrameOwner } from './frame-owner'

interface Location {
  scriptId: string
  lineNumber: number
  columnNumber?: number
}

/** Observe the real engine slot without invoking an authored Promise method. */
export function createWebKitEngineBrand(options: {
  owner: WebKitPageOwner
  frameOwner?: BrowserFrameOwner
  signal: AbortSignal
  onFailure(error: unknown): void
  initializer: {
    source: string
    url: string
    classificationLine: number
    registrationLine: number
  }
}) {
  const { owner, initializer } = options
  const session = owner.session
  const contexts = new Map<number, { type: string; frameId: string }>()
  const scripts = new Map<
    string,
    { executionContextId?: number; sourceURL?: string }
  >()
  const listeners: [string, (...args: any[]) => void][] = []
  const pending = new Set<Promise<void>>()
  const cleanupErrors: unknown[] = []
  let fact: ClientEngineBrandFact | undefined
  let classification: Location | undefined
  let registration: Location | undefined
  let started = false
  let closing = false
  let failure: unknown
  let disposal: Promise<void> | undefined

  function assertOpen() {
    if (failure) throw failure
    if (closing) throw new Error('WebKit engine classifier is closed.')
    options.signal.throwIfAborted()
    owner.assertCurrent()
    options.frameOwner?.assertCurrent()
  }

  function frameId() {
    return options.frameOwner?.nativeFrameId() ?? owner.mainFrameId()
  }

  function fail(error: unknown) {
    if (closing || failure) return
    failure = error
    try {
      options.onFailure(error)
    } catch (observerError) {
      cleanupErrors.push(observerError)
    }
  }

  function listen(name: string, listener: (...args: any[]) => void) {
    session.on(name, listener)
    listeners.push([name, listener])
  }

  async function variables(frame: any) {
    const result = new Map<string, any>()
    for (const scope of frame.scopeChain) {
      if (scope.type === 'global' || scope.type === 'globalLexicalEnvironment')
        continue
      const properties = await session.send('Runtime.getProperties', {
        objectId: scope.object.objectId,
        ownProperties: true,
      })
      for (const property of properties.properties ?? [])
        if (!result.has(property.name))
          result.set(property.name, property.value)
      if (result.has('value') && result.has('decision')) break
      if (!fact && result.has('classify')) break
    }
    return result
  }

  async function paused(event: any) {
    try {
      assertOpen()
      const frame = event.callFrames[0]
      const script = scripts.get(frame?.location.scriptId)
      if (!frame || script?.sourceURL !== initializer.url) return
      const values = await variables(frame)
      if (!fact) {
        const fn = values.get('classify')
        if (fn?.type !== 'function' || typeof fn.objectId !== 'string')
          throw new Error('WebKit classifier function is unavailable.')
        const identity = JSON.parse(fn.objectId)
        const context = contexts.get(identity.injectedScriptId)
        if (
          !Number.isSafeInteger(identity.injectedScriptId) ||
          identity.injectedScriptId <= 0 ||
          (script.executionContextId !== undefined &&
            identity.injectedScriptId !== script.executionContextId) ||
          !context ||
          context.type !== 'normal' ||
          context.frameId !== frameId()
        )
          throw new Error('WebKit classifier belongs to another engine realm.')
        const [{ scriptSource }, { details }] = await Promise.all([
          session.send('Debugger.getScriptSource', {
            scriptId: frame.location.scriptId,
          }),
          session.send('Debugger.getFunctionDetails', {
            functionId: fn.objectId,
          }),
        ])
        const offset = scriptSource.indexOf(initializer.source)
        if (
          offset < 0 ||
          scriptSource.indexOf(initializer.source, offset + 1) !== -1
        )
          throw new Error('WebKit classifier has no unique native source.')
        const firstLine = scriptSource.slice(0, offset).split('\n').length - 1
        registration = {
          scriptId: frame.location.scriptId,
          lineNumber: firstLine + initializer.registrationLine,
        }
        classification = {
          scriptId: frame.location.scriptId,
          lineNumber: firstLine + initializer.classificationLine,
        }
        const functionLine = initializer.source
          .split('\n')
          .findIndex((line) => line.includes('const classify = function '))
        if (
          frame.location.lineNumber !== registration.lineNumber ||
          details.location.scriptId !== registration.scriptId ||
          details.location.lineNumber !== firstLine + functionLine
        )
          throw new Error('WebKit classifier native function location differs.')
        fact = {
          source: initializer.source,
          url: initializer.url,
          scriptId: registration.scriptId,
          // Older WebKit omits scriptParsed.executionContextId. The function's
          // actual injectedScriptId still identifies its Runtime context.
          executionContextId: identity.injectedScriptId,
          contextUniqueId: String(identity.injectedScriptId),
          frameId: context.frameId,
        }
        return
      }
      const context = contexts.get(fact.executionContextId)
      if (
        !context ||
        context.type !== 'normal' ||
        context.frameId !== frameId() ||
        (script.executionContextId !== undefined &&
          script.executionContextId !== fact.executionContextId)
      )
        throw new Error('WebKit classifier has no actual main-world owner.')
      if (
        !classification ||
        frame.location.scriptId !== classification.scriptId ||
        frame.location.lineNumber !== classification.lineNumber ||
        !values.has('value') ||
        !values.has('decision')
      )
        throw new Error('WebKit classifier paused outside its native function.')
      const value = values.get('value')
      let native = false
      if (value?.objectId && value.subtype !== 'proxy') {
        const properties = await session.send('Runtime.getProperties', {
          objectId: value.objectId,
          ownProperties: true,
        })
        // JSC emits these internal fields after its actual JSPromise downcast:
        // https://github.com/WebKit/WebKit/blob/main/Source/JavaScriptCore/inspector/JSInjectedScriptHost.cpp
        native = (properties.internalProperties ?? []).some(
          (property: any) =>
            property.name === 'status' &&
            property.value?.type === 'string' &&
            ['pending', 'fulfilled', 'rejected'].includes(property.value.value)
        )
      }
      const assigned = await session.send('Debugger.evaluateOnCallFrame', {
        callFrameId: frame.callFrameId,
        expression: `decision = ${native ? 1 : 0}`,
        returnByValue: true,
      })
      if (assigned.wasThrown || assigned.result.value !== (native ? 1 : 0))
        throw new Error('WebKit classifier decision could not be assigned.')
    } catch (error) {
      fail(error)
    } finally {
      if (!session.isDisposed())
        await session.send('Debugger.resume').catch(fail)
    }
  }

  function close() {
    if (closing) return
    closing = true
    options.signal.removeEventListener('abort', aborted)
    for (const [name, listener] of listeners) session.off(name, listener)
    disposal = (async () => {
      while (pending.size) await Promise.allSettled([...pending])
      if (session.isDisposed()) return
      for (const [method, params] of [
        ['Page.setBootstrapScript', { source: owner.bootstrapSource() }],
        ['Debugger.disable', undefined],
      ] as const) {
        try {
          await session.send(method, params)
        } catch (error) {
          if (!session.isDisposed()) cleanupErrors.push(error)
        }
      }
    })()
  }

  function aborted() {
    fail(options.signal.reason)
  }

  return {
    async start() {
      if (started) throw new Error('WebKit engine classifier already started.')
      started = true
      assertOpen()
      listen('Runtime.executionContextCreated', ({ context }) => {
        contexts.set(context.id, context)
      })
      listen('Debugger.scriptParsed', (script) => {
        scripts.set(script.scriptId, script)
      })
      listen('Debugger.globalObjectCleared', () => {
        if (fact) fail(new Error('WebKit classifier document was replaced.'))
      })
      listen('Debugger.paused', (event) => {
        const work = paused(event)
        pending.add(work)
        void work.catch(fail).finally(() => pending.delete(work))
      })
      options.signal.addEventListener('abort', aborted, { once: true })
      await session.send('Runtime.enable')
      await session.send('Debugger.enable')
      await session.send('Debugger.setBreakpointsActive', { active: true })
      await session.send('Debugger.setPauseOnDebuggerStatements', {
        enabled: true,
      })
      await session.send('Debugger.setPauseForInternalScripts', {
        shouldPause: true,
      })
      await session.send('Page.setBootstrapScript', {
        source: `${owner.bootstrapSource()}\n${initializer.source}`,
      })
      assertOpen()
    },
    fact(): Readonly<ClientEngineBrandFact> {
      assertOpen()
      if (!fact) throw new Error('WebKit engine classifier never initialized.')
      return { ...fact }
    },
    close,
    async afterOwnersClosed() {
      close()
      await disposal
      if (cleanupErrors.length)
        throw new AggregateError(
          cleanupErrors,
          'WebKit engine classifier cleanup failed.'
        )
    },
  }
}
