import {
  SWITCHYARD_ENV,
  SWITCHYARD_ROUTE_GO_MAXPROCS_ENV,
} from './switchyard-env'

/**
 * How many threads a route.go worker runs Go code on at once, by default,
 * when Switchyard is on.
 *
 * Go's own default is one thread per core, for every Go process. Under
 * Switchyard, `next start` runs three kinds of process on the same machine:
 * Node, Switchyard (a Go process, which has its own limit) and a route.go
 * worker per route (Go processes running the app's handlers). With every one
 * of them using all the cores, they spend their CPU waking each other instead
 * of serving requests.
 */
export const DEFAULT_ROUTE_GO_MAXPROCS = 4

/**
 * The GOMAXPROCS to start a route.go worker with, or undefined to leave the
 * worker's environment as it is.
 *
 * In order: without Switchyard, nothing changes. Otherwise
 * __NEXT_EXPERIMENTAL_SWITCHYARD_ROUTE_GO_MAXPROCS, when it holds a positive
 * whole number, sets it. Otherwise a GOMAXPROCS the user set is kept (the
 * worker inherits it, as Switchyard does). Otherwise the default applies, on
 * machines with more cores than it; on smaller ones Go's choice is already
 * at most that.
 *
 * Known limit: `cores` (os.availableParallelism()) can report the host's
 * cores rather than a container's CPU quota. In a container with a quota
 * under 4 CPUs the default can then be above the quota, and any GOMAXPROCS
 * also turns off the quota-aware default of Go 1.25 and later. Such setups
 * can set __NEXT_EXPERIMENTAL_SWITCHYARD_ROUTE_GO_MAXPROCS.
 */
export function routeGoMaxProcs(
  env: Readonly<Record<string, string | undefined>>,
  cores: number
): string | undefined {
  if (env[SWITCHYARD_ENV] !== '1') return undefined
  const configured = env[SWITCHYARD_ROUTE_GO_MAXPROCS_ENV]
  if (configured !== undefined && isPositiveInteger(configured)) {
    return configured
  }
  if (env.GOMAXPROCS !== undefined && isPositiveInteger(env.GOMAXPROCS)) {
    return undefined
  }
  return cores > DEFAULT_ROUTE_GO_MAXPROCS
    ? String(DEFAULT_ROUTE_GO_MAXPROCS)
    : undefined
}

function isPositiveInteger(value: string): boolean {
  return /^[1-9]\d*$/.test(value)
}
