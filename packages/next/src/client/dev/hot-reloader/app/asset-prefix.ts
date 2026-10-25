import { getAssetPrefix } from '../../../asset-prefix'

/**
 * The asset prefix the dev server's WebSocket connects with.
 *
 * It's read from `document.currentScript`, which is only set while the entry
 * script is being evaluated. So this module has to be evaluated then: it's
 * required at the top level of `app-bootstrap.ts`, before any lazily required
 * module (such as the WebSocket) runs. The dev overlay also imports the
 * WebSocket module during server rendering, where there's no document.
 */
export const assetPrefix = typeof window === 'undefined' ? '' : getAssetPrefix()
