import { EdgeRouteModuleWrapper } from '../../server/web/edge-route-module-wrapper'

// Import the userland code.
import * as module from 'VAR_USERLAND'

export const ComponentMod = module

export default EdgeRouteModuleWrapper.wrap(module.routeModule)
