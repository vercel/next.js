import { createServerModuleMap } from '../../server/app-render/action-utils'
import { setReferenceManifestsSingleton } from '../../server/app-render/encryption-utils'
import type { NextConfigComplete } from '../../server/config-shared'
import { EdgeRouteModuleWrapper } from '../../server/web/edge-route-module-wrapper'

// Import the userland code.
import * as module from 'VAR_USERLAND'

// injected by the loader afterwards.
declare const nextConfig: NextConfigComplete
// INJECT:nextConfig

const cacheHandlers = {}

if (!(globalThis as any).__nextCacheHandlers) {
  ;(globalThis as any).__nextCacheHandlers = cacheHandlers
}

const maybeJSONParse = (str?: string) => (str ? JSON.parse(str) : undefined)

const rscManifest = self.__RSC_MANIFEST?.['VAR_PAGE']
const rscServerManifest = maybeJSONParse(self.__RSC_SERVER_MANIFEST)

if (rscManifest && rscServerManifest) {
  setReferenceManifestsSingleton({
    page: 'VAR_PAGE',
    clientReferenceManifest: rscManifest,
    serverActionsManifest: rscServerManifest,
    serverModuleMap: createServerModuleMap({
      serverActionsManifest: rscServerManifest,
    }),
  })
}

export const ComponentMod = module

export default EdgeRouteModuleWrapper.wrap(module.routeModule, { nextConfig })
