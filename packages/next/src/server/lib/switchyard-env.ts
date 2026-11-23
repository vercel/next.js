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

/**
 * The most threads each route.go worker runs Go code on at once (the
 * worker's GOMAXPROCS) when Switchyard is on. It limits the workers, which run
 * the app's own handlers, not Switchyard's process. See
 * switchyard-route-go-threads.ts for the default.
 */
export const SWITCHYARD_ROUTE_GO_MAXPROCS_ENV =
  '__NEXT_EXPERIMENTAL_SWITCHYARD_ROUTE_GO_MAXPROCS'

/**
 * `0` keeps Switchyard on but sends every request through Node, as in its
 * first version, so the direct path to route.go workers can be compared with
 * the path through Node, or switched off on its own.
 */
export const SWITCHYARD_DIRECT_ENV = '__NEXT_EXPERIMENTAL_SWITCHYARD_DIRECT'
