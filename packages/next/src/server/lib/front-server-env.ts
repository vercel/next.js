/**
 * Environment variables of the experimental front server
 * (src/server/lib/front-server.ts). The CI workflows and taskfile.js, which
 * can't import this, spell them out.
 */

/** `1` makes `next start` run behind next-front. */
export const FRONT_SERVER_ENV = '__NEXT_EXPERIMENTAL_FRONT_SERVER'

/** Path to a next-front executable; checked before the bundled one. */
export const FRONT_SERVER_BINARY_ENV = '__NEXT_EXPERIMENTAL_FRONT_SERVER_BINARY'

/** `1` makes `next`'s build compile next-front into dist/server/front. */
export const BUILD_FRONT_SERVER_ENV = 'NEXT_BUILD_FRONT_SERVER'
