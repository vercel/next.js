/**
 * Environment variables of the experimental Switchyard
 * (src/server/lib/switchyard.ts). The CI workflows and taskfile.js, which
 * can't import this, spell them out.
 */

/** `1` makes `next start` run behind switchyard. */
export const SWITCHYARD_ENV = '__NEXT_EXPERIMENTAL_SWITCHYARD'

/** Path to a switchyard executable; checked before the bundled one. */
export const SWITCHYARD_BINARY_ENV = '__NEXT_EXPERIMENTAL_SWITCHYARD_BINARY'

/** `1` makes `next`'s build compile switchyard into dist/server/switchyard. */
export const BUILD_SWITCHYARD_ENV = 'NEXT_BUILD_SWITCHYARD'

/** Passed only to the child process, never on its command line. */
export const SWITCHYARD_TOKEN_ENV = '__NEXT_PRIVATE_SWITCHYARD_TOKEN'
