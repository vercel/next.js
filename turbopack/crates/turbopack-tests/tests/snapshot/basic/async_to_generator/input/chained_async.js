// Tests async dependency chain: this module has a top-level await
// and re-exports from another async module.
import { topValue } from './async_module.js'

export const chainedValue = await Promise.resolve(topValue + ' chained')
