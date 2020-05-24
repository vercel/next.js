import RefreshRuntime from 'react-refresh/runtime'
import RefreshHelpers from './internal/helpers'

export type RefreshRuntimeGlobals = {
  $RefreshReg$: (type: unknown, id: string) => void
  $RefreshSig$: () => (type: unknown) => unknown
  $RefreshInterceptModuleExecution$: (moduleId: string) => () => void
  $RefreshHelpers$: typeof RefreshHelpers
}

declare const self: Window & RefreshRuntimeGlobals

// Hook into ReactDOM initialization
RefreshRuntime.injectIntoGlobalHook(self)

// noop fns to prevent runtime errors during initialization
self.$RefreshReg$ = () => {}
self.$RefreshSig$ = () => type => type

// Register global helpers
self.$RefreshHelpers$ = RefreshHelpers

// Register a helper for module execution interception
self.$RefreshInterceptModuleExecution$ = function(webpackModuleId) {
  const prevRefreshReg = self.$RefreshReg$
  const prevRefreshSig = self.$RefreshSig$

  self.$RefreshReg$ = (type, id) => {
    RefreshRuntime.register(type, webpackModuleId + ' ' + id)
  }
  self.$RefreshSig$ = RefreshRuntime.createSignatureFunctionForTransform

  // Modeled after `useEffect` cleanup pattern:
  // https://reactjs.org/docs/hooks-effect.html#effects-with-cleanup
  return () => {
    self.$RefreshReg$ = prevRefreshReg
    self.$RefreshSig$ = prevRefreshSig
  }
}
