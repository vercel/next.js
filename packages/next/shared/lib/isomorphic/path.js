/**
 * This module is for next.js server internal usage of path module.
 * It will use native path module for nodejs runtime.
 * It will use path-browserify polyfill for edge runtime.
 */

const path =
  process.env.NEXT_RUNTIME === 'edge'
    ? require('next/dist/compiled/path-browserify')
    : require('path')

module.exports = path
