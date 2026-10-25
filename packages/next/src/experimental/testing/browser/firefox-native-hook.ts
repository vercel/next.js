export interface FirefoxNativeHook {
  target: string
  frame: string
  realm: number
  browserId: number
  frameBrowsingContextId?: number
  parentBrowsingContextId?: number
  selectedRealm?: number
  source: string
  token: string
}

/** This self-contained function runs once in Gecko's owned system console. */
function nativeHook(input: FirefoxNativeHook, operation: 'install' | 'close') {
  const system = globalThis as typeof globalThis & {
    ChromeUtils: { importESModule(url: string): any }
    Debugger: new () => any
  }
  const { TargetActorRegistry } = system.ChromeUtils.importESModule(
    'resource://devtools/server/actors/targets/target-actor-registry.sys.mjs'
  )
  const target = TargetActorRegistry.getTargetActors(
    { type: 'browser-element', browserId: input.browserId },
    ''
  ).find((item: any) => item.actorID === input.target)
  if (!target) return { found: false }
  if (
    (input.frameBrowsingContextId === undefined &&
      target.innerWindowId !== input.realm) ||
    target.browserId !== input.browserId
  )
    throw new Error('Firefox native hook realm ownership changed.')
  const key = Symbol.for('next.test.firefox.native-engine-brand')
  const hooks: Map<string, any> = (target[key] ??= new Map())
  if (operation === 'close') {
    const record = hooks.get(input.token)
    if (record && record.frame !== input.frame)
      return { found: true, alreadyClosed: true }
    if (
      record &&
      input.selectedRealm !== undefined &&
      record.realm !== input.selectedRealm
    )
      return { found: true, alreadyClosed: true }
    return record ? record.close() : { found: true, alreadyClosed: true }
  }
  const actor = target.conn.getActor(input.frame)
  if (!actor || target.threadActor.state !== 'paused')
    throw new Error('Firefox native hook has no actual paused frame.')
  const frame = actor.frame
  const binding = frame.environment.find('classify')
  if (!binding) throw new Error('Firefox native classifier binding is missing.')
  const issued = binding.getVariable('classify')
  if (
    issued.class !== 'Function' ||
    issued.script.source.text !== input.source ||
    frame.script.source !== issued.script.source
  )
    throw new Error('Firefox native classifier function or source changed.')
  const windowGlobal = frame.script.global.unsafeDereference().windowGlobalChild
  const actualRealm = windowGlobal?.innerWindowId
  const actualContext = windowGlobal?.browsingContext
  if (
    !Number.isSafeInteger(actualRealm) ||
    actualRealm <= 0 ||
    (input.frameBrowsingContextId === undefined
      ? actualRealm !== input.realm
      : actualContext?.id !== input.frameBrowsingContextId ||
        actualContext?.top?.browserId !== input.browserId ||
        actualContext?.parent?.id !== input.parentBrowsingContextId)
  )
    throw new Error(
      'Firefox native classifier has a different actual test Window.'
    )
  const previous = hooks.get(input.token)
  if (previous) {
    if (
      input.frameBrowsingContextId === undefined ||
      previous.realm === actualRealm
    )
      throw new Error('Firefox native hook was already installed.')
    previous.close(true)
  }
  system.ChromeUtils.importESModule(
    'resource://gre/modules/jsdebugger.sys.mjs'
  ).addDebuggerToGlobal(globalThis)
  const native = new system.Debugger()
  try {
    const realm = native.addDebuggee(frame.script.global.unsafeDereference())
    const fn = realm.makeDebuggeeValue(issued.unsafeDereference())
    const source = fn.script.source
    const previousDebugger = target.threadActor.dbg
    const previousHandler = previousDebugger.onDebuggerStatement
    let closed = false
    let result: object | undefined
    function close(notify = false) {
      if (closed) return result
      closed = true
      native.enabled = false
      native.removeAllDebuggees()
      if (previousDebugger.onDebuggerStatement === undefined)
        previousDebugger.onDebuggerStatement = previousHandler
      hooks.delete(input.token)
      if (!hooks.size) delete target[key]
      target.off('destroyed', targetDestroyed)
      target.off('window-destroyed', windowDestroyed)
      result = {
        found: true,
        closed: true,
        disabled: !native.enabled,
        debuggees: native.getDebuggees().length,
        restored: previousDebugger.onDebuggerStatement === previousHandler,
      }
      if (notify)
        target.conn.send({
          from: target.actorID,
          type: 'next-test-native-hook-window-closed',
          token: input.token,
          frame: input.frame,
          realm: actualRealm,
          ...result,
        })
      return result
    }
    function targetDestroyed() {
      close(input.frameBrowsingContextId !== undefined)
    }
    function windowDestroyed(event: any) {
      if (event.id !== actualRealm) return
      close(true)
    }
    native.onDebuggerStatement = function (actual: any) {
      if (actual.callee !== fn) return
      try {
        if (
          actual.script.global !== realm ||
          actual.script.source !== source ||
          actual.arguments.length !== 1
        )
          throw new Error('Firefox native classifier escaped its issued frame.')
        const environment = actual.environment.find('decision')
        if (!environment || typeof environment.setVariable !== 'function')
          throw new Error(
            'Firefox native classifier lexical binding is missing.'
          )
        const value = actual.arguments[0]
        const decision =
          value !== null &&
          typeof value === 'object' &&
          !value.isProxy &&
          value.class === 'Promise'
            ? 1
            : 0
        // These are native Debugger operations. No debuggee function, property
        // getter, Proxy trap, or remote evaluation runs during classification.
        environment.setVariable('decision', decision)
        if (environment.getVariable('decision') !== decision)
          throw new Error(
            'Firefox native classifier did not publish its decision.'
          )
      } catch (error) {
        target.conn.send({
          from: target.actorID,
          type: 'next-test-native-hook-failure',
          token: input.token,
          frame: input.frame,
          realm: actualRealm,
          message: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    }
    previousDebugger.onDebuggerStatement = undefined
    hooks.set(input.token, { close, realm: actualRealm, frame: input.frame })
    target.once('destroyed', targetDestroyed)
    target.on('window-destroyed', windowDestroyed)
    return {
      found: true,
      installed: true,
      realm: actualRealm,
      browsingContextId: actualContext.id,
    }
  } catch (error) {
    native.enabled = false
    native.removeAllDebuggees()
    throw error
  }
}

export function firefoxNativeHookSource(
  hook: FirefoxNativeHook,
  operation: 'install' | 'close'
) {
  return `JSON.stringify((${nativeHook.toString()})(${JSON.stringify(hook)},${JSON.stringify(operation)}))`
}
