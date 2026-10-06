// The real-world zod shape: `z` is a namespace that lib.js hands out as a plain
// value, and the consumer only ever reads static members of it.
import { z } from './lib.js'

console.log(z.object(), z.string(), z.defaultLocale)
