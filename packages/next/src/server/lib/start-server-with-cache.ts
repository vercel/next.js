/**
 * Start Server Entry Point with Bytecode Caching
 *
 * This is the entry point for the dev server that uses V8 bytecode caching
 * to speed up loading of the bundled dev server on subsequent startups.
 *
 * Environment variables:
 *   NEXT_DISABLE_BYTECODE_CACHE=1 - Disable bytecode caching
 *   NEXT_USE_UNBUNDLED_SERVER=1 - Use unbundled server instead
 */

import path from 'path'
import { isBytecodeCacheEnabled, loadWithBytecodeCache } from './bytecode-cache'

// Determine which server to load
const useBundled = process.env.NEXT_USE_UNBUNDLED_SERVER !== '1'
const useBytecodeCache = isBytecodeCacheEnabled() && useBundled

const serverPath = useBundled
  ? path.join(__dirname, '../../compiled/dev-server/start-server.js')
  : path.join(__dirname, './start-server.js')

// Load the server module
let serverModule: typeof import('./start-server')

if (useBytecodeCache) {
  // Use bytecode caching for faster subsequent loads
  serverModule = loadWithBytecodeCache(serverPath)
} else {
  // Regular require
  serverModule = require(serverPath)
}

// Re-export everything from the server module
export const { startServer, getRequestHandlers } = serverModule
