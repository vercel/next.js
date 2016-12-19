import { warn } from './utils'
const css = require('glamor')

warn('Warning: \'next/css\' is deprecated. Please use styled-jsx syntax instead.')

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
