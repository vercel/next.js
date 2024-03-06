import * as __index from './index';

/**
 * Load all the modules in the correct order.
 * This is just like the entrypoint (`@edge-runtime/primitives`), only
 * lazy.
 *
 * @param scopedContext a record of values that will be available to
 * all modules. This is useful for providing a different implementation of
 * globals, like `Uint8Array`.
 *
 * @example
 * ```ts
 * import { load } from '@edge-runtime/primitives/load'
 *
 * const { crypto, fetch, Request, Headers } = load({
 *   Uint8Array: MyCustomUint8Array,
 *   Error: MyCustomError,
 * })
 * ```
 */
declare function load(
  scopedContext: Record<string, unknown>,
): typeof __index

export { load };
