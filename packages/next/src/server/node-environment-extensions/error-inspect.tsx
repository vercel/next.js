import { patchErrorInspectNodeJS } from '../patch-error-inspect'

patchErrorInspectNodeJS(globalThis.Error)
