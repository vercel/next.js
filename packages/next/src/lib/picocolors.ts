let picocolors: typeof import('next/dist/compiled/picocolors')

if (process.env.NEXT_RUNTIME === 'edge' || process.env.NEXT_MINIMAL) {
  picocolors = require('./web/picocolors').default
} else {
  picocolors = require('next/dist/compiled/picocolors')
}

export default picocolors
