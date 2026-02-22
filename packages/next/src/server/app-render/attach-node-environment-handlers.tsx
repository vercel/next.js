/**
 * Attaches bundled handler implementations to the node-environment extensions.
 *
 * The node-environment extensions (random, date, crypto, console-file) patch
 * globals at process startup and dispatch to registered handlers at runtime.
 * The handlers live here in app-render/ because they depend on server runtime
 * modules that must go through the bundler for correct React resolution.
 *
 * This module should be imported once from each bundled entry point
 * (app-page/module.ts, app-route/module.ts) to wire up the handlers.
 */

import { registerSyncIOHandler } from '../node-environment-extensions/sync-io-utils.external'
import { handleSyncIO } from './sync-io-handler'

registerSyncIOHandler(handleSyncIO)
