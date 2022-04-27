/**
 * This module is for next.js server internal usage of path module.
 * It will use native path module for nodejs runtime.
 * It will use path-browserify polyfill for edge runtime.
 */

import type { PlatformPath } from 'path'

const path: PlatformPath =
  process.env.NEXT_RUNTIME === 'edge'
    ? require('next/dist/compiled/path-browserify')
    : require('path')

export default path

const {
  join,
  resolve,
  normalize,
  isAbsolute,
  relative,
  dirname,
  basename,
  sep,
  delimiter,
  extname,
  parse,
  format,
  toNamespacedPath,
  win32,
  posix,
} = path

export {
  join,
  resolve,
  normalize,
  isAbsolute,
  relative,
  dirname,
  basename,
  sep,
  delimiter,
  extname,
  parse,
  format,
  toNamespacedPath,
  win32,
  posix,
}
