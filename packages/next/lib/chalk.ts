let chalk: typeof import('next/dist/compiled/chalk')

if (typeof window === 'undefined') {
  chalk = require('next/dist/compiled/chalk')
} else {
  chalk = require('./web/chalk').default
}

export default chalk
