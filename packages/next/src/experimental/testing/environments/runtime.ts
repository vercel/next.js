import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { TestExecutionEnvironment } from '../contracts'

type Realm = typeof globalThis & Record<string, any>
type WindowRealm = Record<string, any>
type Teardown = () => unknown | Promise<unknown>

function restoreGlobals(before: Map<PropertyKey, PropertyDescriptor>) {
  const failures: unknown[] = []
  // Restore originals before deleting additions: materializing a lazy Node
  // descriptor can initialize globals which still belong to this owner.
  for (const [key, descriptor] of before) {
    try {
      Object.defineProperty(globalThis, key, descriptor)
    } catch (error) {
      failures.push(error)
    }
  }
  for (const key of Reflect.ownKeys(globalThis)) {
    if (!before.has(key)) {
      try {
        if (!Reflect.deleteProperty(globalThis, key))
          throw new Error(`Cannot remove environment global ${String(key)}.`)
      } catch (error) {
        failures.push(error)
      }
    }
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      'Test environment global restoration failed.'
    )
}

const domOverrides = new Set([
  'Event',
  'EventTarget',
  'DOMException',
  'FormData',
  'Blob',
  'File',
  'WebSocket',
  'navigator',
  'localStorage',
  'sessionStorage',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'close',
  'name',
  'length',
])
const happyOverrides = [
  'Request',
  'Response',
  'MessagePort',
  'fetch',
  'Headers',
  'AbortController',
  'AbortSignal',
  'URL',
  'URLSearchParams',
  'FormData',
]
// Some WindowProxy providers resolve these without exposing a descriptor.
// matchMedia also has a configurable placeholder in the pinned DOM contract.
const domProviderKeys = [
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'matchMedia',
]

function populateWindow(win: WindowRealm, happy: boolean, domProvider = false) {
  const realm = globalThis as Realm
  const overrides = new Set([...domOverrides, ...(happy ? happyOverrides : [])])
  const keys = new Set<string>(domProvider ? domProviderKeys : [])
  for (
    let current = win;
    current && current !== Object.prototype;
    current = Object.getPrototypeOf(current)
  ) {
    for (const key of Object.getOwnPropertyNames(current)) {
      if (
        !(key in realm) ||
        overrides.has(key) ||
        /^(?:HTML|SVG|DOM|XML)|Event$/.test(key)
      )
        keys.add(key)
    }
  }
  for (const key of ['window', 'self', 'top', 'parent', 'globalThis', 'global'])
    keys.delete(key)
  const assigned = new Map<string, unknown>()
  for (const key of keys) {
    let bound: unknown
    // Existing lazy Node getters must never run during descriptor capture.
    // Window getters can throw for disabled storage; defer them until accessed.
    let owner = win
    while (owner && !Object.hasOwn(owner, key))
      owner = Object.getPrototypeOf(owner)
    const functionValue =
      owner && Object.getOwnPropertyDescriptor(owner, key)?.value
    if (typeof functionValue === 'function' && /^[a-z]/.test(key))
      bound = functionValue.bind(win)
    Object.defineProperty(realm, key, {
      configurable: true,
      get() {
        if (assigned.has(key)) return assigned.get(key)
        if (bound) return bound
        const value = win[key]
        if (domProvider && typeof value === 'function' && /^[a-z]/.test(key))
          return (bound = value.bind(win))
        return value
      },
      set(value) {
        assigned.set(key, value)
        win[key] = value
      },
    })
  }
  for (const key of ['window', 'self', 'top', 'parent'])
    Object.defineProperty(realm, key, {
      configurable: true,
      writable: true,
      value: realm,
    })
  if (win.document)
    Object.defineProperty(win.document, 'defaultView', {
      configurable: true,
      get: () => realm,
    })
}

function observeWindowErrors(
  win: WindowRealm,
  onError?: (error: unknown) => void
): Teardown {
  if (!onError) return () => {}
  const add = win.addEventListener.bind(win)
  const remove = win.removeEventListener.bind(win)
  const listeners = new Set<unknown>()
  const report = (event: {
    error?: unknown
    defaultPrevented?: boolean
    preventDefault(): void
  }) => {
    if (
      !listeners.size &&
      !win.onerror &&
      !event.defaultPrevented &&
      event.error != null
    ) {
      event.preventDefault()
      onError(event.error)
    }
  }
  add('error', report)
  const originalAdd = win.addEventListener
  const originalRemove = win.removeEventListener
  win.addEventListener = (
    type: string,
    listener: unknown,
    ...args: unknown[]
  ) => {
    if (type === 'error' && listener) listeners.add(listener)
    return add(type, listener, ...args)
  }
  win.removeEventListener = (
    type: string,
    listener: unknown,
    ...args: unknown[]
  ) => {
    if (type === 'error') listeners.delete(listener)
    return remove(type, listener, ...args)
  }
  return () => {
    remove('error', report)
    win.addEventListener = originalAdd
    win.removeEventListener = originalRemove
    listeners.clear()
  }
}

/** Real provider lifecycle in the owned file process, independent of compilation. */
export async function openTestEnvironment(
  projectDir: string,
  selected: TestExecutionEnvironment,
  onError?: (error: unknown) => void
) {
  // Materializing Node's lazy descriptors can initialize nonconfigurable
  // infrastructure symbols. Capture those before the provider runs as well.
  const before = new Map<PropertyKey, PropertyDescriptor>()
  for (;;) {
    const keys = Reflect.ownKeys(globalThis)
    for (const key of keys) {
      if (!before.has(key))
        before.set(key, Object.getOwnPropertyDescriptor(globalThis, key)!)
    }
    if (Reflect.ownKeys(globalThis).every((key) => before.has(key))) break
  }
  const consumerRequire = createRequire(path.join(projectDir, 'package.json'))
  let teardown: Teardown | undefined
  let disposing: Promise<void> | undefined
  function dispose() {
    return (disposing ??= (async () => {
      const errors: unknown[] = []
      try {
        await teardown?.()
      } catch (error) {
        errors.push(error)
      }
      try {
        restoreGlobals(before)
      } catch (error) {
        errors.push(error)
      }
      if (errors.length === 1) throw errors[0]
      if (errors.length)
        throw new AggregateError(errors, 'Test environment teardown failed.')
    })())
  }
  async function load(name: string) {
    let resolved: string
    try {
      resolved = consumerRequire.resolve(name)
    } catch (cause) {
      throw new Error(
        `Cannot resolve test environment ${JSON.stringify(name)} from ${projectDir}. Install its real provider in the test project.`,
        { cause }
      )
    }
    return import(pathToFileURL(resolved).href)
  }
  try {
    const options = selected.options ?? {}
    if (selected.name === 'node') return { dispose }
    if (selected.name === 'jsdom') {
      const provider = await load('jsdom')
      const {
        html = '<!DOCTYPE html>',
        url = 'http://localhost:3000',
        contentType = 'text/html',
        pretendToBeVisual = true,
        includeNodeLocations = false,
        runScripts = 'dangerously',
        console: forwardConsole = false,
        cookieJar = false,
        userAgent,
        resources,
        ...rest
      } = (options.jsdom as Record<string, any>) ?? {}
      const virtualConsole = forwardConsole
        ? new provider.VirtualConsole()
        : undefined
      if (virtualConsole) {
        if (virtualConsole.forwardTo)
          virtualConsole.forwardTo(globalThis.console)
        else virtualConsole.sendTo(globalThis.console)
      }
      const resourceOptions = provider.ResourceLoader
        ? {
            resources:
              resources ??
              (userAgent
                ? new provider.ResourceLoader({ userAgent })
                : undefined),
            userAgent,
          }
        : { resources: userAgent ? { ...resources, userAgent } : resources }
      const dom = new provider.JSDOM(html, {
        url,
        contentType,
        pretendToBeVisual,
        includeNodeLocations,
        runScripts,
        virtualConsole,
        cookieJar: cookieJar ? new provider.CookieJar() : undefined,
        ...resourceOptions,
        ...rest,
      })
      teardown = () => dom.window.close()
      const clearErrors = observeWindowErrors(dom.window, onError)
      teardown = () => {
        try {
          clearErrors()
        } finally {
          dom.window.close()
        }
      }
      populateWindow(dom.window, false, true)
      Object.defineProperty(globalThis, 'jsdom', {
        configurable: true,
        writable: true,
        value: dom,
      })
    } else if (selected.name === 'edge-runtime') {
      const { openEdgeContext } = await import('./edge.js')
      const edge = openEdgeContext(options)
      teardown = edge.dispose
      populateWindow(edge.context, false)
    } else if (selected.name === 'happy-dom') {
      const provider = await load('happy-dom')
      const optionsForWindow = (options.happyDOM as Record<string, any>) ?? {}
      const win = new (provider.GlobalWindow ?? provider.Window)({
        ...optionsForWindow,
        url: optionsForWindow.url ?? 'http://localhost:3000',
        console: globalThis.console,
        settings: { ...optionsForWindow.settings, disableErrorCapturing: true },
      })
      teardown = async () => {
        if (win.happyDOM.abort) {
          try {
            await win.happyDOM.abort()
          } finally {
            win.close()
          }
        } else win.happyDOM.cancelAsync()
      }
      const closeWindow = teardown
      const clearErrors = observeWindowErrors(win, onError)
      teardown = async () => {
        try {
          await clearErrors()
        } finally {
          await closeWindow()
        }
      }
      populateWindow(win, true, true)
    } else {
      const module = await load(
        selected.name.startsWith('.') || path.isAbsolute(selected.name)
          ? path.resolve(projectDir, selected.name)
          : `vitest-environment-${selected.name}`
      )
      const environment = module.default
      if (
        !environment ||
        typeof environment.name !== 'string' ||
        typeof environment.setup !== 'function' ||
        !['ssr', 'client'].includes(environment.viteEnvironment)
      )
        throw new Error(
          'Custom test environment must export a default object with name, viteEnvironment and setup.'
        )
      if (environment.viteEnvironment !== 'ssr')
        throw new Error(
          'Custom client environment compilation conditions are not implemented; use an ssr environment.'
        )
      const result = await environment.setup(globalThis, options)
      if (!result || typeof result.teardown !== 'function')
        throw new Error(
          'Custom test environment setup must return a teardown function.'
        )
      teardown = () => result.teardown(globalThis)
    }
    return { dispose }
  } catch (error) {
    try {
      await dispose()
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        'Test environment setup and cleanup failed.'
      )
    }
    throw error
  }
}
