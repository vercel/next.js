import { randomBytes } from 'node:crypto'
import type { BrowserContext, CDPSession, Page } from 'playwright'
import { enginePromiseBrandKey } from './engine-brand-contract'

interface Location {
  scriptId: string
  lineNumber: number
  columnNumber: number
}
interface ExecutionContext {
  id: number
  uniqueId: string
  origin: string
  auxData?: { isDefault?: boolean; type?: string; frameId?: string }
}
/** Issued only by this parent's actual initializer and debugger registration. */
export interface ClientEngineBrandFact {
  source: string
  url: string
  scriptId: string
  executionContextId: number
  contextUniqueId: string
  frameId: string
}

/** A synchronous engine predicate, independent of all file/test ownership. */
export function createClientEngineBrand(options: {
  context: BrowserContext
  page: Page
  url: string
  signal: AbortSignal
  onFailure(error: unknown): void
}) {
  const origin = new URL(options.url).origin
  const url = `next-test-engine-brand://${randomBytes(32).toString('hex')}`
  // The initial pause authenticates the actual function before document code.
  // Subsequent pauses expose just the parameter's RemoteObject engine subtype.
  const sourceLines = [
    '(() => {',
    '  if (globalThis !== globalThis.top) return;',
    '  const Missing = Error;',
    '  const nativePrototype = Promise.prototype;',
    '  const getPrototype = Object.getPrototypeOf;',
    '  const classify = function enginePromiseBrand(value) {',
    '    let decision;',
    '    debugger;',
    '    if (decision !== 0 && decision !== 1) throw new Missing("Browser Mode engine Promise decision is unavailable.");',
    '    return decision === 0 ? 0 : getPrototype(value) === nativePrototype ? 1 : 2;',
    '  };',
    `  Object.defineProperty(globalThis, Symbol.for(${JSON.stringify(enginePromiseBrandKey)}), { value: classify });`,
    '  debugger;',
    '})();',
    `//# sourceURL=${url}`,
  ]
  const source = sourceLines.join('\n')
  const functionLine = sourceLines.findIndex((line) =>
    line.includes('const classify = function ')
  )
  const classificationLine = sourceLines.indexOf('    debugger;')
  const registrationLine = sourceLines.indexOf('  debugger;')
  const contexts = new Map<number, ExecutionContext>()
  const scripts = new Map<string, number>()
  const pending = new Set<Promise<unknown>>()
  const listeners: [string, (...args: any[]) => void][] = []
  let session: CDPSession | undefined
  let initializer: string | undefined
  let breakpoint: string | undefined
  let frameId = ''
  let functionLocation: Location | undefined
  let fact: ClientEngineBrandFact | undefined
  let failure: unknown
  let closing = false
  let started = false
  let sessionClosed = false
  let disposal: Promise<void> | undefined
  const cleanupErrors: unknown[] = []
  function track<T>(operation: Promise<T>): Promise<T> {
    const task = operation.finally(() => pending.delete(task))
    pending.add(task)
    task.catch(() => {})
    return task
  }
  function assertOpen() {
    options.signal.throwIfAborted()
    if (closing || options.page.isClosed())
      throw new Error('Browser Mode engine classifier is closed.')
    if (failure) throw failure
  }
  function post(method: string, params: object = {}): Promise<any> {
    assertOpen()
    return track(session!.send(method as any, params))
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
  function listen(event: string, listener: (...args: any[]) => void) {
    session!.on(event as any, listener)
    listeners.push([event, listener])
  }
  async function resume() {
    // Disposal and abort must resume even after assertOpen starts refusing work.
    await session?.send('Debugger.resume').catch(() => {})
  }
  function sameLocation(a: Location, b: Location) {
    return (
      a.scriptId === b.scriptId &&
      a.lineNumber === b.lineNumber &&
      a.columnNumber === b.columnNumber
    )
  }
  async function paused(event: any) {
    try {
      if (closing || options.signal.aborted || failure) return
      const frame = event.callFrames?.[0]
      if (!frame) throw new Error('Missing engine classifier pause frame.')
      const contextId = scripts.get(frame.location.scriptId)
      const context =
        contextId === undefined ? undefined : contexts.get(contextId)
      if (!functionLocation && contextId !== undefined) {
        if (
          fact ||
          frame.location.lineNumber !== registrationLine ||
          !context ||
          context.origin !== origin ||
          context.auxData?.isDefault !== true ||
          context.auxData.type !== 'default' ||
          context.auxData.frameId !== frameId ||
          !context.uniqueId
        )
          throw new Error('Invalid engine classifier initialization realm.')
        const { scriptSource } = await post('Debugger.getScriptSource', {
          scriptId: frame.location.scriptId,
        })
        if (scriptSource !== source)
          throw new Error('Engine classifier initializer source changed.')
        const local = frame.scopeChain.find(
          (scope: any) => scope.type === 'local'
        )
        if (!local) throw new Error('Missing engine initializer local scope.')
        const variables = await post('Runtime.getProperties', {
          objectId: local.object.objectId,
          ownProperties: true,
          generatePreview: false,
        })
        const read = {
          result: variables.result?.find(
            (property: any) => property.name === 'classify'
          )?.value,
        }
        if (read.result?.type !== 'function')
          throw new Error('Cannot authenticate the engine classifier function.')
        const properties = await post('Runtime.getProperties', {
          objectId: read.result.objectId,
          ownProperties: true,
          generatePreview: false,
        })
        const actual: Location | undefined =
          properties.internalProperties?.find(
            (property: any) => property.name === '[[FunctionLocation]]'
          )?.value?.value
        await post('Runtime.releaseObject', { objectId: read.result.objectId })
        if (
          !actual ||
          actual.scriptId !== frame.location.scriptId ||
          actual.lineNumber !== functionLine ||
          !Number.isInteger(actual.columnNumber)
        )
          throw new Error('Invalid actual engine classifier function location.')
        const installed = await post('Debugger.setBreakpoint', {
          location: {
            scriptId: actual.scriptId,
            lineNumber: classificationLine,
            columnNumber: 4,
          },
        })
        if (
          !installed.breakpointId ||
          !sameLocation(installed.actualLocation, {
            scriptId: actual.scriptId,
            lineNumber: classificationLine,
            columnNumber: 4,
          })
        )
          throw new Error('Engine classifier breakpoint location changed.')
        breakpoint = installed.breakpointId
        assertOpen()
        functionLocation = actual
        fact = {
          source,
          url,
          scriptId: actual.scriptId,
          executionContextId: context.id,
          contextUniqueId: context.uniqueId,
          frameId,
        }
        return
      }
      if (
        !functionLocation ||
        !frame.functionLocation ||
        !sameLocation(frame.functionLocation, functionLocation)
      )
        return // Unrelated authored debugger statements never receive decisions.
      if (
        !fact ||
        frame.location.scriptId !== fact.scriptId ||
        frame.location.lineNumber !== classificationLine ||
        frame.location.columnNumber !== 4 ||
        context?.uniqueId !== fact.contextUniqueId
      )
        throw new Error('Engine classifier pause escaped its registered realm.')
      const local = frame.scopeChain.findIndex(
        (scope: any) => scope.type === 'local'
      )
      if (local < 0)
        throw new Error('Missing engine classifier decision scope.')
      const variables = await post('Runtime.getProperties', {
        objectId: frame.scopeChain[local].object.objectId,
        ownProperties: true,
        generatePreview: false,
      })
      const read = {
        result: variables.result?.find(
          (property: any) => property.name === 'value'
        )?.value,
      }
      if (typeof read.result?.type !== 'string')
        throw new Error('Cannot read the engine Promise brand.')
      const decision = read.result.subtype === 'promise' ? 1 : 0
      await post('Debugger.setVariableValue', {
        scopeNumber: local,
        variableName: 'decision',
        newValue: { value: decision },
        callFrameId: frame.callFrameId,
      })
      if (read.result.objectId)
        await post('Runtime.releaseObject', { objectId: read.result.objectId })
    } catch (error) {
      fail(error)
    } finally {
      await resume()
    }
  }
  function close(): void {
    if (closing) return
    closing = true
    options.signal.removeEventListener('abort', onAbort)
    // Release paused JavaScript immediately. Pending setup acquisition is also
    // retained, and a late-acquired session detaches instead of publishing.
    disposal = track(
      (async () => {
        await resume()
        if (breakpoint)
          await session
            ?.send('Debugger.removeBreakpoint', { breakpointId: breakpoint })
            .catch(() => {})
        await session?.send('Debugger.disable').catch(() => {})
        if (initializer)
          await session
            ?.send('Page.removeScriptToEvaluateOnNewDocument', {
              identifier: initializer,
            })
            .catch(() => {})
        for (const [event, listener] of listeners)
          session?.off(event as any, listener)
        try {
          await session?.detach()
        } catch (error) {
          if (!options.page.isClosed() && !sessionClosed)
            cleanupErrors.push(error)
        }
      })()
    )
  }
  const onAbort = () => close()
  return {
    start() {
      return track(
        (async () => {
          assertOpen()
          if (started) throw new Error('Engine classifier cannot start twice.')
          started = true
          options.signal.addEventListener('abort', onAbort, { once: true })
          const acquired = await track(
            options.context.newCDPSession(options.page)
          )
          if (closing || options.signal.aborted) {
            await track(acquired.detach())
            assertOpen()
          }
          session = acquired
          assertOpen()
          listen('close', () => {
            sessionClosed = true
            if (!closing)
              fail(new Error('Engine classifier CDP session disconnected.'))
          })
          listen('Runtime.executionContextCreated', ({ context }) => {
            contexts.set(context.id, context)
          })
          listen('Runtime.executionContextsCleared', () => {
            contexts.clear()
            if (fact && !closing)
              fail(
                new Error('Engine classifier execution realms were cleared.')
              )
          })
          listen(
            'Runtime.executionContextDestroyed',
            ({ executionContextId }) => {
              contexts.delete(executionContextId)
              if (fact?.executionContextId === executionContextId && !closing)
                fail(
                  new Error('Engine classifier execution realm was destroyed.')
                )
            }
          )
          listen('Debugger.scriptParsed', (script) => {
            if (script.url === url) {
              const execution = contexts.get(script.executionContextId)
              if (!execution) {
                fail(
                  new Error(
                    'Engine classifier initializer has no execution realm.'
                  )
                )
                return
              }
              if (execution.auxData?.frameId !== frameId) return
              if (scripts.size) {
                fail(new Error('Engine classifier initializer executed twice.'))
                return
              }
              scripts.set(script.scriptId, script.executionContextId)
            }
          })
          listen('Debugger.paused', (event) => {
            void track(paused(event)).catch(fail)
          })
          await post('Page.enable')
          await post('Runtime.enable')
          await post('Debugger.enable')
          await post('Debugger.setSkipAllPauses', { skip: false })
          const tree = await post('Page.getFrameTree')
          frameId = tree.frameTree.frame.id
          if (!frameId)
            throw new Error('Missing engine classifier owner frame.')
          const installed = await post(
            'Page.addScriptToEvaluateOnNewDocument',
            {
              source,
            }
          )
          initializer = installed.identifier
          assertOpen()
        })()
      )
    },
    fact(): Readonly<ClientEngineBrandFact> {
      assertOpen()
      if (!fact)
        throw new Error('Engine Promise classifier was never authenticated.')
      return { ...fact }
    },
    close,
    async afterOwnersClosed() {
      close()
      await disposal
      while (pending.size) await Promise.allSettled([...pending])
      if (cleanupErrors.length)
        throw new AggregateError(
          cleanupErrors,
          'Engine classifier session cleanup failed.'
        )
    },
  }
}
