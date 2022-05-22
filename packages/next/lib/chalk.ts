let chalk: typeof import('next/dist/compiled/chalk')

if (process.env.NEXT_RUNTIME === 'edge') {
  chalk = require('./web/chalk').default
} else {
  chalk = require('next/dist/compiled/chalk')
}

export default chalk
