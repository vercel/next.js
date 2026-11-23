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
 * Node, Switchyard (a Go process too) and a route.go worker per route (Go processes running the app's handlers). With every one
 * of them using all the cores, they spend their CPU waking each other instead
 * of serving requests.
 */
export const DEFAULT_ROUTE_GO_MAXPROCS = 4

/**
 * The GOMAXPROCS to start a route.go worker with, or undefined to leave the
 * worker's environment as it is.
 *
 * In order: without Switchyard, nothing changes. Otherwise
 * __NEXT_EXPERIMENTAL_SWITCHYARD_ROUTE_GO_MAXPROCS, when Go would accept it,
 * sets it. Otherwise a GOMAXPROCS the user set is kept (the worker inherits
 * it). Otherwise the default applies, but never above `cores`
 * (os.availableParallelism(), which counts a container's CPU quota on
 * current Node versions). Go 1.24 doesn't count the quota itself, so without
 * this a worker in a 2-CPU container on a large host would run on every one
 * of the host's cores.
 */
export function routeGoMaxProcs(
  env: Readonly<Record<string, string | undefined>>,
  cores: number
): string | undefined {
  if (env[SWITCHYARD_ENV] !== '1') return undefined
  const configured = env[SWITCHYARD_ROUTE_GO_MAXPROCS_ENV]
  if (configured !== undefined && goAcceptsMaxProcs(configured)) {
    return configured
  }
  if (env.GOMAXPROCS !== undefined && goAcceptsMaxProcs(env.GOMAXPROCS)) {
    return undefined
  }
  return String(Math.max(1, Math.min(DEFAULT_ROUTE_GO_MAXPROCS, cores)))
}

/**
 * Whether Go's runtime accepts value as GOMAXPROCS: decimal digits only (no
 * sign; leading zeros are fine) for a number from 1 to 2^31 - 1.
 */
function goAcceptsMaxProcs(value: string): boolean {
  if (!/^\d+$/.test(value)) return false
  const n = Number(value)
  return n >= 1 && n <= 2 ** 31 - 1
}
