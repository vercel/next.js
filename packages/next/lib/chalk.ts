let chalk: typeof import('next/dist/compiled/chalk')

if (!process.browser) {
  chalk = require('next/dist/compiled/chalk')
} else {
  chalk = require('./web/chalk').default
}

export default chalk
