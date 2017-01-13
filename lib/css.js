import { deprecated } from './utils'
const css = require('glamor')
// Needed because of the mutation below
delete require.cache[require.resolve('glamor')]

for (const [k, v] of Object.entries(css)) {
  if (typeof v === 'function') {
    css[k] = deprecated(v, 'Warning: \'next/css\' is deprecated. Please refer to the migration guide: https://github.com/zeit/next.js/wiki/Migrating-from-next-css')
  }
}

/**
 * Expose style as default and the whole object as properties
 * so it can be used as follows:
 *
 * import css, { merge } from 'next/css'
 * css({ color: 'red' })
 * merge({ color: 'green' })
 * css.merge({ color: 'blue' })
 */

css.default = css.style
Object.keys(css).forEach(key => {
  if (key !== 'default') {
    css.default[key] = css[key]
  }
})

module.exports = css
