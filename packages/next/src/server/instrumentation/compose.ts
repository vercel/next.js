import type { InstrumentationModule } from './types'

/** Compose plugin instrumentation with the application's instrumentation. */
export function createInstrumentation(
  modules: InstrumentationModule[]
): InstrumentationModule {
  return {
    async register() {
      for (const mod of modules) {
        // Registration failures must still prevent the server from starting.
        await mod.register?.()
      }
    },
    async onRequestError(...args) {
      for (const mod of modules) {
        try {
          await mod.onRequestError?.(...args)
        } catch (err) {
          // A failing integration must not prevent other integrations from
          // observing the original request error.
          console.error('Error in instrumentation.onRequestError:', err)
        }
      }
    },
  }
}
