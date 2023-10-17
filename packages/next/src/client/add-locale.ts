import type { addLocale as Fn } from '../shared/lib/router/utils/add-locale'
import { normalizePathTrailingSlash } from './normalize-trailing-slash'

export const addLocale: typeof Fn = (path, ...args) => {
  if (process.env.__NEXT_I18N_SUPPORT) {
    return normalizePathTrailingSlash(
      require('../shared/lib/router/utils/add-locale').addLocale(path, ...args)
    )
  }
  return path
}
