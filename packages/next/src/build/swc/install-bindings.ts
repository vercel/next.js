/**
 * This module provides a way to install SWC bindings without eagerly loading the entire swc/index module.
 *
 * The swc/index module can transitively load other modules (like webpack-config) that import React,
 * and React's entry point checks process.env.NODE_ENV at require time to decide whether to load
 * the development or production bundle. By deferring the require of swc/index until this function
 * is called, we ensure NODE_ENV is set before React is loaded.
 */

/**
 * Loads and caches the native bindings. This is idempotent and should be called early so bindings
 * can be accessed synchronously later.
 *
 * @param useWasmBinary - Whether to use WASM bindings instead of native bindings
 */
export async function installBindings(
  useWasmBinary: boolean = false
): Promise<void> {
  // Lazy require to avoid loading swc/index (and transitively webpack-config/React)
  // before NODE_ENV is set
  const { loadBindings } = require('./index') as typeof import('./index')
  await loadBindings(useWasmBinary)
}
