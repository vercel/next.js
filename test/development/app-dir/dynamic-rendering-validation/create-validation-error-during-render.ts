import type { WorkStore } from 'next/dist/server/app-render/work-async-storage.external'

export function createValidationErrorDuringRender(): Error | null {
  // This probe tests server rendering, including the SSR of Client Components.
  // Keep validation internals out of the browser bundle; browser renders have
  // no server validation error to display.
  if (typeof window === 'undefined') {
    const {
      createDynamicTrackingState,
      createDynamicValidationState,
      trackAllowedDynamicAccess,
    } =
      require('next/dist/server/app-render/dynamic-rendering') as typeof import('next/dist/server/app-render/dynamic-rendering')

    const validation = createDynamicValidationState()
    // Invoke validation while React is rendering so it can capture the current
    // owner stack. This exercises error formatting without requiring Cache
    // Components, which is unsupported in Edge. The supplied component stack
    // should only be used when no React owner stack is available.
    trackAllowedDynamicAccess(
      undefined,
      { route: '/owner-stack' } as WorkStore,
      '\n    at ComponentStackFallback (<anonymous>)',
      validation,
      createDynamicTrackingState(false)
    )
    return validation.dynamicErrors[0]
  } else {
    return null
  }
}
