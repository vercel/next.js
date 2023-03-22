import * as jest from 'jest-circus-browser/dist/umd/jest-circus'
import expectMod from 'expect/build-es5/index'

type CallSignature<T extends (...a: any[]) => unknown> = (
  ...a: Parameters<T>
) => ReturnType<T>

declare global {
  var __jest__: typeof jest
  var expect: typeof expectMod
  // We need to extract only the call signature as `autoReady(jest.describe)` drops all the other properties
  var describe: CallSignature<typeof jest.describe>
  var it: CallSignature<typeof jest.it>
  var READY: (arg: string) => void
  var nsObj: (obj: any) => any

  interface Window {
    NEXT_HYDRATED?: boolean
    onNextHydrated?: () => void
  }
}

let isReady = false
function autoReady<T extends (...a: any[]) => unknown>(
  fn: (...args: Parameters<T>) => ReturnType<T>
): (...args: Parameters<T>) => ReturnType<T> {
  return (...args) => {
    if (!isReady) {
      isReady = true
      requestIdleCallback(
        () => {
          if (typeof READY === 'function') {
            READY('')
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
    return fn(...args)
  }
}

globalThis.__jest__ = jest
globalThis.expect = expectMod
globalThis.describe = autoReady(jest.describe)
globalThis.it = autoReady(jest.it)

// From https://github.com/webpack/webpack/blob/9fcaa243573005d6fdece9a3f8d89a0e8b399613/test/TestCases.template.js#L422
globalThis.nsObj = function nsObj(obj) {
  Object.defineProperty(obj, Symbol.toStringTag, {
    value: 'Module',
  })
  return obj
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitForPath(contentWindow: Window, path: string): Promise<void> {
  while (true) {
    if (contentWindow.location.pathname === path) {
      break
    }

    await wait(1)
  }
}

export function waitForLoaded(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve) => {
    if (
      iframe.contentDocument != null &&
      iframe.contentDocument.readyState === 'complete'
    ) {
      resolve()
    } else {
      iframe.addEventListener('load', () => {
        resolve()
      })
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
      iframe.addEventListener('load', () => {
        waitForHydrationAndResolve(iframe.contentWindow!, path).then(resolve)
      })
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
