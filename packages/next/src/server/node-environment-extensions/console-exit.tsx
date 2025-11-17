/**
 * Patches console methods to exit the workUnitAsyncStorage so that inside the host implementation
 * sync IO can be called. This is relevant for example with runtimes that patch console methods to
 * prepend a timestamp to the log output.
 *
 * Note that this will only exit for already installed patched console methods. If you further patch
 * the console method after this and add any sync IO there it will trigger sync IO warnings while prerendering.
 *
 * This is a pragmatic concession because layering the patches if you install your own log implementation
 * after they are installed is very tricky to do correctly because the order matters
 */

import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'

type ConsoleMethodName = keyof Console

function patchConsoleMethod(methodName: ConsoleMethodName): void {
  const descriptor = Object.getOwnPropertyDescriptor(console, methodName)
  if (
    descriptor &&
    (descriptor.configurable || descriptor.writable) &&
    typeof descriptor.value === 'function'
  ) {
    const originalMethod = descriptor.value
    const originalName = Object.getOwnPropertyDescriptor(originalMethod, 'name')
    let wrapperMethod = function (...args: any[]) {
      return workUnitAsyncStorage.exit(() =>
        originalMethod.apply(console, args)
      )
    }
    if (originalName) {
      Object.defineProperty(wrapperMethod, 'name', originalName)
    }
    Object.defineProperty(console, methodName, {
      value: wrapperMethod,
    })
  }
}

// We patch the same methods that React and our dev patch do.
// We may find other methods that could benefit from patching but if
// they exist we ought to consider patching them in all three places
patchConsoleMethod('error')
patchConsoleMethod('assert')
patchConsoleMethod('debug')
patchConsoleMethod('dir')
patchConsoleMethod('dirxml')
patchConsoleMethod('group')
patchConsoleMethod('groupCollapsed')
patchConsoleMethod('groupEnd')
patchConsoleMethod('info')
patchConsoleMethod('log')
patchConsoleMethod('table')
patchConsoleMethod('trace')
patchConsoleMethod('warn')
