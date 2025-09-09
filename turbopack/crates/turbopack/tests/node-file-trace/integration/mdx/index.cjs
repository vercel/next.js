const os = require('os')

// also trace the react and react/jsx-runtime
require('react')
require('react/jsx-runtime')

import('@mdx-js/node-loader')

import('./mdx.js')

const { existsSync } = eval('require')('fs')

if (__dirname.startsWith(os.tmpdir()) && existsSync('./snowfall.jsx')) {
  throw new Error('snowfall.jsx should not exist')
}
