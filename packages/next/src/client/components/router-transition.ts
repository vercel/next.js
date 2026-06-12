import type {
  ClientInstrumentationHooks,
  ClientInstrumentationModules,
  RouterTransitionType,
} from '../router-transition-types'

let instrumentationModules: readonly ClientInstrumentationHooks[] = []

export function initializeRouterTransitionModules(
  modules: ClientInstrumentationModules
): void {
  instrumentationModules = modules.filter(
    (module): module is ClientInstrumentationHooks => module != null
  )
}

function callHooks(invoke: (hooks: ClientInstrumentationHooks) => void): void {
  for (const hooks of instrumentationModules) {
    try {
      invoke(hooks)
    } catch (error) {
      console.error(
        'An instrumentation-client router transition hook failed',
        error
      )
    }
  }
}

export function startRouterTransition(
  url: string,
  type: RouterTransitionType
): void {
  callHooks((hooks) => hooks.onRouterTransitionStart?.(url, type))
}
