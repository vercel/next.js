/**
 * Start Server Entry Point for Bundled Dev Server
 *
 * This module provides a unified entry point that can load either the bundled
 * or unbundled dev server based on environment configuration.
 *
 * Environment variables:
 *   NEXT_USE_UNBUNDLED_SERVER=1 - Use unbundled server instead (for development)
 */

import path from 'path'

// Determine which server to load
const useBundled = process.env.NEXT_USE_UNBUNDLED_SERVER !== '1'

const serverPath = useBundled
  ? path.join(__dirname, '../../compiled/dev-server/start-server.js')
  : path.join(__dirname, './start-server.js')

// Load the server module
const serverModule: typeof import('./start-server') = require(serverPath)

// Re-export everything from the server module
export const { startServer, getRequestHandlers } = serverModule
