import * as jest from 'jest-circus-browser/dist/umd/jest-circus'
import expectMod from 'expect/build-es5/index'

declare global {
  var __jest__: typeof jest
  var expect: typeof expectMod
  // We need to extract only the call signature as `autoReady(jest.describe)` drops all the other properties
  var describe: AutoReady<typeof jest.describe>
  var it: AutoReady<typeof jest.it>
  var TURBOPACK_READY: (arg: string) => void
  var TURBOPACK_CHANGE_FILE: (arg: string) => void
  var nsObj: (obj: any) => any
  var __turbopackFileChanged: (id: string, error: Error) => void

  interface Window {
    NEXT_HYDRATED?: boolean
    onNextHydrated?: () => void
  }
}

globalThis.__jest__ = jest
globalThis.expect = expectMod
globalThis.describe = autoReady(jest.describe, markReady)
globalThis.it = autoReady(jest.it, markReady)

// From https://github.com/webpack/webpack/blob/9fcaa243573005d6fdece9a3f8d89a0e8b399613/test/TestCases.template.js#L422
globalThis.nsObj = function nsObj(obj) {
  Object.defineProperty(obj, Symbol.toStringTag, {
    value: 'Module',
  })
  return obj
}

type AnyFunction = (...args: any[]) => any

type AutoReady<T extends AnyFunction> = T & {
  [K in keyof T]: T[K] extends AnyFunction ? AutoReady<T[K]> : T[K]
}

function autoReady<T extends AnyFunction, F extends () => void>(
  fn: T,
  callback: F
): AutoReady<T> {
  const wrappedFn = ((...args: Parameters<T>): ReturnType<T> => {
    callback()

    return fn(...args)
  }) as AutoReady<T>

  for (const key in fn) {
    if (typeof fn[key] === 'function') {
      ;(wrappedFn as any)[key] = autoReady(fn[key] as AnyFunction, callback)
    } else {
      ;(wrappedFn as any)[key] = fn[key]
    }
  }

  return wrappedFn
}

let isReady = false
function markReady() {
  if (!isReady) {
    isReady = true
    requestIdleCallback(
      () => {
        if (typeof TURBOPACK_READY === 'function') {
          TURBOPACK_READY('')
        } else {
          console.info(
            '%cTurbopack tests:',
            'font-weight: bold;',
            'Entering debug mode. Run `await __jest__.run()` in the browser console to run tests.'
          )
        }
      },
      { timeout: 20000 }
    )
  }
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function waitForCondition(
  predicate: () => boolean,
  timeout: number | null = null
): Promise<void> {
  const start = Date.now()
  while (true) {
    if (predicate()) {
      break
    }

    await wait(1)

    if (timeout != null && Date.now() - start > timeout) {
      throw new Error('Timed out waiting for condition')
    }
  }
}

async function waitForPath(contentWindow: Window, path: string): Promise<void> {
  return waitForCondition(() => contentWindow.location.pathname === path)
}

/**
 * Loads a new page in an iframe and waits for it to load.
 */
export function load(iframe: HTMLIFrameElement, path: string): Promise<void> {
  iframe.src = path

  return new Promise((resolve) => {
    let eventListener = () => {
      iframe.removeEventListener('load', eventListener)
      resolve()
    }
    iframe.addEventListener('load', eventListener)
  })
}

/**
 * Waits for the currently loading page in an iframe to finish loading.
 *
 * If the iframe is already loaded, this function will return immediately.
 *
 * Note: if you've just changed the iframe's `src` attribute, you should use `load` instead.
 */
export function waitForLoaded(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve) => {
    if (
      iframe.contentDocument != null &&
      iframe.contentDocument.readyState === 'complete'
    ) {
      resolve()
    } else {
      let eventListener = () => {
        iframe.removeEventListener('load', eventListener)
        resolve()
      }
      iframe.addEventListener('load', eventListener)
    }
  })
}

export function waitForSelector(
  node: ParentNode | HTMLIFrameElement | ShadowRoot,
  selector: string
): Promise<Element> {
  return new Promise((resolve, reject) => {
    const document = 'contentDocument' in node ? node.contentDocument! : node
    const timeout = 30000
    let element = document.querySelector(selector)
    if (element) {
      return resolve(element)
    }
    const observer = new MutationObserver(async () => {
      let el = document.querySelector(selector)
      if (el) {
        resolve(el)
        observer.disconnect()
      }
    })
    observer.observe(document, { childList: true, subtree: true })
    if (timeout) {
      setTimeout(() => {
        observer.disconnect()
        reject(new Error(`Timed out waiting for selector "${selector}"`))
      }, timeout)
    }
  })
}

export async function waitForErrorOverlay(
  node: ParentNode | HTMLIFrameElement
): Promise<ShadowRoot> {
  let element = await waitForSelector(node, 'nextjs-portal')
  return element.shadowRoot!
}

export function waitForHydration(
  iframe: HTMLIFrameElement,
  path: string
): Promise<void> {
  return new Promise((resolve) => {
    if (
      iframe.contentDocument != null &&
      iframe.contentDocument.readyState === 'complete'
    ) {
      waitForHydrationAndResolve(iframe.contentWindow!, path).then(resolve)
    } else {
      const eventListener = () => {
        waitForHydrationAndResolve(iframe.contentWindow!, path).then(resolve)
        iframe.removeEventListener('load', eventListener)
      }
      iframe.addEventListener('load', eventListener)
    }
  })
}

async function waitForHydrationAndResolve(
  contentWindow: Window,
  path: string
): Promise<void> {
  await waitForPath(contentWindow, path)

  return await new Promise((resolve) => {
    if (contentWindow.NEXT_HYDRATED) {
      resolve()
    } else {
      contentWindow.onNextHydrated = () => {
        resolve()
      }
    }
  })
}

export function markAsHydrated() {
  window.NEXT_HYDRATED = true
  if (typeof window.onNextHydrated === 'function') {
    window.onNextHydrated()
  }
}

const fileChangedResolvers: Map<
  string,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
> = new Map()

globalThis.__turbopackFileChanged = (id: string, error?: Error) => {
  const resolver = fileChangedResolvers.get(id)
  if (resolver == null) {
    throw new Error(`No resolver found for id ${id}`)
  } else if (error != null) {
    resolver.reject(error)
  } else {
    resolver.resolve(null)
  }
}

function unsafeUniqueId(): string {
  const LENGTH = 10
  const BASE = 16
  return Math.floor(Math.random() * Math.pow(BASE, LENGTH))
    .toString(BASE)
    .slice(0, LENGTH)
}

export async function changeFile(
  path: string,
  find: string,
  replaceWith: string
) {
  return new Promise((resolve, reject) => {
    let id
    while ((id = unsafeUniqueId())) {
      if (!fileChangedResolvers.has(id)) break
    }

    fileChangedResolvers.set(id, { resolve, reject })

    TURBOPACK_CHANGE_FILE(JSON.stringify({ path, id, find, replaceWith }))
  })
}
