// The zod shape from vercel/next.js#99954: `z.core` is a namespace reexport and
// `z.core.locales` is another one. Only `z.core.CoreError` and `z.string` are read.
import * as z from './lib.js'

console.log(new z.core.CoreError(z.string()))
