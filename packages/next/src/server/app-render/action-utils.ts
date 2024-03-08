import type { ActionManifest } from '../../build/webpack/plugins/flight-client-entry-plugin'

// This function creates a Flight-acceptable server module map proxy from our
// Server Reference Manifest similar to our client module map.
// This is because our manifest contains a lot of internal Next.js data that
// are relevant to the runtime, workers, etc. that React doesn't need to know.
export function createServerModuleMap({
  serverActionsManifest,
  pageName,
}: {
  serverActionsManifest: ActionManifest
  pageName: string
}) {
  return new Proxy(
    {},
    {
      get: (_, id: string) => {
        return {
          id: serverActionsManifest[
            process.env.NEXT_RUNTIME === 'edge' ? 'edge' : 'node'
          ][id].workers['app' + pageName],
          name: id,
          chunks: [],
        }
      },
    }
  )
}
