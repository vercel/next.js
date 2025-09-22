import RefreshRuntime from 'react-refresh/runtime'
import type { RefreshRuntimeGlobals } from './runtime'

declare const self: Window & RefreshRuntimeGlobals

if (typeof self !== 'undefined') {
  var $RefreshInjected$ = '__reactRefreshInjected'

  // Only inject the runtime if it hasn't been injected
  if (!self[$RefreshInjected$]) {
    RefreshRuntime.injectIntoGlobalHook(self)

    // Empty implementation to avoid "ReferenceError: variable is not defined" in module which didn't pass builtin:react-refresh-loader
    self.$RefreshSig$ = () => (type) => type
    self.$RefreshReg$ = () => {}

    // Mark the runtime as injected to prevent double-injection
    self[$RefreshInjected$] = true
  }
}
