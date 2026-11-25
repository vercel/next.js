const path = require('node:path')

const rule = (loader) => ({ loaders: [loader], as: '*.js' })

/** @type {import('next').NextConfig} */
module.exports = {
  turbopack: {
    rules: {
      '*.c01.txt': rule('./loaders/c01.js'),
      '*.c02.txt': rule('./loaders/c02.js'),
      '*.c03.txt': rule('./loaders/c03.js'),
      '*.c04.txt': rule('./loaders/c04.js'),
      '*.c05.txt': rule('./loaders/c05.mjs'),
      '*.c06.txt': rule('./loaders/c06.js'),
      '*.c08.txt': rule('./loaders/c08.js'),
      '*.c09.txt': rule('./loaders/c09.js'),
      '*.c10.txt': rule('pkg-loader'),
      '*.c11.txt': rule('resdir-loader'),
      '*.c12.txt': rule('./loaders/c12.js'),
      '*.c13.txt': rule('cond-loader'),
      '*.c14.txt': rule('./loaders/c14.js'),
      '*.c16.txt': rule(path.resolve(__dirname, 'loaders/c16.js')),
    },
  },
}
