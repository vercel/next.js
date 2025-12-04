import { setManifestsSingleton } from '../../server/app-render/manifests-singleton'
import type { NextConfigRuntime } from '../../server/config-shared'
import type { EdgeHandler } from '../../server/web/adapter'
import { EdgeRouteModuleWrapper } from '../../server/web/edge-route-module-wrapper'

// Import the userland code.
import * as module from 'VAR_USERLAND'

// injected by the loader afterwards.
declare const nextConfig: NextConfigRuntime
// INJECT:nextConfig

const maybeJSONParse = (str?: string) => (str ? JSON.parse(str) : undefined)

const rscManifest = self.__RSC_MANIFEST?.['VAR_PAGE']
const rscServerManifest = maybeJSONParse(self.__RSC_SERVER_MANIFEST)

if (rscManifest && rscServerManifest) {
  setManifestsSingleton({
    page: 'VAR_PAGE',
    clientReferenceManifest: rscManifest,
    serverActionsManifest: rscServerManifest,
  })
}

export const ComponentMod = module

const handler: EdgeHandler = EdgeRouteModuleWrapper.wrap(module.routeModule, {
  nextConfig,
  page: 'VAR_PAGE',
})
export default handler
