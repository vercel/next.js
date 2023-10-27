/**
 * This module is for next.js server internal usage of path module.
 * It will use native path module for nodejs runtime.
 * It will use path-browserify polyfill for edge runtime.
 */
let path

if (process.env.NEXT_RUNTIME === 'edge') {
  path = require('next/dist/compiled/path-browserify')
} else {
  path = require('path')
}

module.exports = path
