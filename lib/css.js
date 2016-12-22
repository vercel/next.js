import { deprecated } from './utils'
const css = require('glamor')

for (const [k, v] of Object.entries(css)) {
  if (typeof v === 'function') {
    css[k] = deprecated(v, 'Warning: \'next/css\' is deprecated. Please use styled-jsx syntax instead.')
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
