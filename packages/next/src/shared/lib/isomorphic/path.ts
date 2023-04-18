/**
 * This module is for next.js server internal usage of path module.
 * It will use native path module for nodejs runtime.
 * It will use path-browserify polyfill for edge runtime.
 */
// @ts-ignore
export { default } from 'next/dist/compiled/path-browserify'
