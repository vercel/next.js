import { EdgeRouteModuleWrapper } from '../../server/web/edge-route-module-wrapper'

// Import the userland code.
// @ts-expect-error - replaced by webpack/turbopack loader
import * as module from 'VAR_USERLAND'

export const ComponentMod = module

export default EdgeRouteModuleWrapper.wrap(module.routeModule)
