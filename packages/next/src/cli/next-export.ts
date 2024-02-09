import { cyan } from '../lib/picocolors'
import * as Log from '../build/output/log'

const nextExport = () => {
  Log.error(`
    \`next export\` has been removed in favor of "output: export" in next.config.js.\nLearn more: ${cyan(
      'https://nextjs.org/docs/advanced-features/static-html-export'
    )}
  `)
}

export { nextExport }
