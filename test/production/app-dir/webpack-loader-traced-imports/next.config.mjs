import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default {
  turbopack: {
    rules: {
      '*.tsx': {
        loaders: [path.join(dirname, 'loader.js')],
      },
    },
  },
}
