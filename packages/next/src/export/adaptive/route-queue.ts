/**
 * Route-affine work queue for the adaptive static generation scheduler.
 *
 * Pages of the same route share per-process state while they render: loaded
 * modules, `"use cache"` and fetch cache entries, React caches. Spreading one
 * route over every worker repeats that work per worker and has several
 * workers render the same (possibly heavy) route at once. So:
 *
 * 1. Work-conserving: `take` returns pages whenever any page is left.
 * 2. A free worker claims a route nobody else is rendering and keeps taking
 *    chunks of it, in order, until it has handed out every page.
 * 3. Only when every remaining route is owned does a free worker help: it
 *    picks the owned route with the most remaining work and takes chunks
 *    from the end of its remaining pages, so the owner keeps going in order
 *    from the front.
 * 4. Every route tracks the average render time and memory of its pages.
 * 5. Heavy-route limit (optional): while one worker renders a route known
 *    to be heavy, other workers don't start another heavy route as long as
 *    light routes are waiting. A route with several pages left and no
 *    measurements yet gets a one-page probe first, so a heavy route isn't
 *    claimed blind.
 *
 * This class is pure and has no timers, so it can be unit tested directly.
 */

export type RouteTask = { id: number; route: string }

export type RouteCost = {
  pages: number
  avgMs: number
  avgHeapBytes: number | undefined
}

type Route<T extends RouteTask> = {
  name: string
  /** Not yet handed out, sorted by id. */
  pending: T[]
  owner: number | undefined
  inFlight: number
  cost: RouteCost
  /** A single-page probe of this route is in flight. */
  probing: boolean
  /** When the current owner claimed it, to break ties between heavy routes. */
  claimSeq: number
}

export type RouteQueueOptions = {
  heavyRouteLimit: boolean
}

export type TakeResult<T> = {
  tasks: T[]
  placement: string
}

/** A route is heavy when its pages take this many times the median route... */
const HEAVY_FACTOR = 3
/** ...and at least this long. */
const HEAVY_MIN_MS = 1000
/** Same for memory per page, when it's known. */
const HEAVY_MIN_HEAP_BYTES = 64 * 1024 * 1024
/** Samples needed before a route can be called heavy. */
const HEAVY_MIN_SAMPLES = 1
/** Measured routes needed for a meaningful median. */
const MEDIAN_MIN_ROUTES = 3
/** Probe unmeasured routes with at least this many pages left. */
const PROBE_MIN_PAGES = 4

function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function insertSorted<T extends RouteTask>(list: T[], task: T) {
  let lo = 0
  let hi = list.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (list[mid].id < task.id) lo = mid + 1
    else hi = mid
  }
  list.splice(lo, 0, task)
}

export class RouteQueue<T extends RouteTask> {
  private readonly routes = new Map<string, Route<T>>()
  /** Routes in order of their first page, for deterministic claiming. */
  private readonly order: Route<T>[] = []
  private readonly owned = new Map<number, Route<T>>()
  private pendingCount = 0
  private claims = 0
  /** Medians over measured routes, recomputed after a page completes. */
  private medians:
    | {
        routes: number
        ms: number | undefined
        heap: number | undefined
        heaps: number
      }
    | undefined

  constructor(
    tasks: readonly T[],
    private readonly options: RouteQueueOptions
  ) {
    for (const task of [...tasks].sort((a, b) => a.id - b.id)) {
      this.routeFor(task.route).pending.push(task)
      this.pendingCount++
    }
  }

  private routeFor(name: string): Route<T> {
    let route = this.routes.get(name)
    if (!route) {
      route = {
        name,
        pending: [],
        owner: undefined,
        inFlight: 0,
        cost: { pages: 0, avgMs: 0, avgHeapBytes: undefined },
        probing: false,
        claimSeq: 0,
      }
      this.routes.set(name, route)
      this.order.push(route)
    }
    return route
  }

  /** Pages not handed out yet. */
  get size(): number {
    return this.pendingCount
  }

  costOf(route: string): RouteCost | undefined {
    return this.routes.get(route)?.cost
  }

  ownerOf(route: string): number | undefined {
    return this.routes.get(route)?.owner
  }

  /** Whether `route` is known to be heavy compared to the other routes. */
  isHeavy(name: string): boolean {
    const route = this.routes.get(name)
    if (!route || route.cost.pages < HEAVY_MIN_SAMPLES) return false
    const medians = this.getMedians()
    if (medians.routes < MEDIAN_MIN_ROUTES || medians.ms === undefined) {
      return false
    }
    if (
      route.cost.avgMs >= HEAVY_MIN_MS &&
      route.cost.avgMs >= HEAVY_FACTOR * medians.ms
    ) {
      return true
    }
    return (
      route.cost.avgHeapBytes !== undefined &&
      medians.heap !== undefined &&
      medians.heaps >= MEDIAN_MIN_ROUTES &&
      route.cost.avgHeapBytes >= HEAVY_MIN_HEAP_BYTES &&
      route.cost.avgHeapBytes >= HEAVY_FACTOR * medians.heap
    )
  }

  private getMedians() {
    if (!this.medians) {
      const measured = this.order.filter((r) => r.cost.pages > 0)
      const heaps = measured
        .map((r) => r.cost.avgHeapBytes)
        .filter((h): h is number => h !== undefined)
      this.medians = {
        routes: measured.length,
        ms: median(measured.map((r) => r.cost.avgMs)),
        heap: median(heaps),
        heaps: heaps.length,
      }
    }
    return this.medians
  }

  /**
   * Another worker is rendering a known heavy route right now. When this
   * worker owns a heavy route too (both were claimed before either was known
   * to be heavy), only the later claim yields, so the two workers don't both
   * set their routes aside.
   */
  private heavyElsewhere(slot: number): boolean {
    const own = this.owned.get(slot)
    const ownSeq =
      own && this.isHeavy(own.name) ? own.claimSeq : Number.POSITIVE_INFINITY
    for (const route of this.order) {
      if (
        route.owner !== undefined &&
        route.owner !== slot &&
        route.claimSeq < ownSeq &&
        (route.pending.length > 0 || route.inFlight > 0) &&
        this.isHeavy(route.name)
      ) {
        return true
      }
    }
    return false
  }

  private remainingWork(route: Route<T>): number {
    const fallback = this.getMedians().ms ?? 1
    return (
      route.pending.length *
      (route.cost.pages > 0 ? route.cost.avgMs : fallback)
    )
  }

  /**
   * Hands `slot` up to `count` pages, following the rules at the top of this
   * file. Returns no pages only when none are left.
   */
  take(slot: number, count: number): TakeResult<T> {
    count = Math.max(1, count)
    if (this.pendingCount === 0) return { tasks: [], placement: 'none' }

    const limit = this.options.heavyRouteLimit && this.heavyElsewhere(slot)

    // 2a. Keep going on our own route, unless the heavy-route limit says to
    // set it aside for light routes.
    const own = this.owned.get(slot)
    if (own && own.pending.length > 0) {
      const lightWaiting = this.claimable(slot).some(
        (r) => !this.isHeavy(r.name)
      )
      if (!(limit && this.isHeavy(own.name) && lightWaiting)) {
        return this.fromFront(own, count, 'route')
      }
      this.release(slot)
    } else if (own) {
      this.release(slot)
    }

    // 2b. Claim a route nobody is rendering.
    const candidates = this.claimable(slot)
    if (candidates.length > 0) {
      let pick = candidates[0]
      if (limit) {
        // Keep this worker on light routes while a heavy one renders
        // elsewhere. Routes being probed are skipped unless nothing else is
        // left.
        pick =
          candidates.find((r) => !this.isHeavy(r.name) && !r.probing) ??
          candidates.find((r) => !this.isHeavy(r.name)) ??
          candidates[0]
        if (
          !this.isHeavy(pick.name) &&
          pick.cost.pages === 0 &&
          !pick.probing &&
          pick.pending.length >= PROBE_MIN_PAGES
        ) {
          // Unmeasured and big: render one page to learn its cost before
          // committing a worker to it.
          pick.probing = true
          return this.fromFront(pick, 1, 'probe')
        }
      }
      if (!(limit && this.isHeavy(pick.name) && this.lightOwned(slot))) {
        pick.owner = slot
        pick.claimSeq = ++this.claims
        this.owned.set(slot, pick)
        return this.fromFront(pick, count, 'claim')
      }
      // Only heavy routes are unclaimed, but light pages still wait on
      // routes other workers own: help those instead of starting a second
      // heavy route.
    }

    // 3. Everything left is owned by someone else: help the route with the
    // most remaining work, from the end. With the heavy-route limit, help
    // light routes first.
    const helpable = this.order.filter(
      (r) => r.pending.length > 0 && r.owner !== slot
    )
    const pool =
      limit && helpable.some((r) => !this.isHeavy(r.name))
        ? helpable.filter((r) => !this.isHeavy(r.name))
        : helpable
    let best = pool[0]
    for (const route of pool) {
      if (this.remainingWork(route) > this.remainingWork(best)) best = route
    }
    return this.fromEnd(best, count, 'help')
  }

  /** Some light route owned by another worker still has pages waiting. */
  private lightOwned(slot: number): boolean {
    return this.order.some(
      (r) =>
        r.pending.length > 0 &&
        r.owner !== undefined &&
        r.owner !== slot &&
        !this.isHeavy(r.name)
    )
  }

  /** Unowned routes with pages left, in page order. */
  private claimable(slot: number): Route<T>[] {
    return this.order.filter(
      (r) => r.pending.length > 0 && (r.owner === undefined || r.owner === slot)
    )
  }

  private release(slot: number) {
    const own = this.owned.get(slot)
    if (own && own.owner === slot) own.owner = undefined
    this.owned.delete(slot)
  }

  private fromFront(route: Route<T>, count: number, placement: string) {
    const tasks = route.pending.splice(0, count)
    this.handOut(route, tasks.length)
    return { tasks, placement: `${placement}:${route.name}` }
  }

  private fromEnd(route: Route<T>, count: number, placement: string) {
    const tasks = route.pending.splice(
      Math.max(0, route.pending.length - count)
    )
    this.handOut(route, tasks.length)
    return { tasks, placement: `${placement}:${route.name}` }
  }

  private handOut(route: Route<T>, n: number) {
    route.inFlight += n
    this.pendingCount -= n
  }

  /** Puts handed-out pages back (refused, or the worker restarted). */
  giveBack(tasks: readonly T[]) {
    for (const task of tasks) {
      const route = this.routeFor(task.route)
      route.inFlight = Math.max(0, route.inFlight - 1)
      route.probing = false
      insertSorted(route.pending, task)
      this.pendingCount++
    }
  }

  /** A page left the queue for good (it will run elsewhere, e.g. isolated). */
  forget(task: T) {
    const route = this.routeFor(task.route)
    route.inFlight = Math.max(0, route.inFlight - 1)
  }

  /** A page finished; update its route's running averages. */
  complete(task: T, ms: number | undefined, heapBytes: number | undefined) {
    const route = this.routeFor(task.route)
    route.inFlight = Math.max(0, route.inFlight - 1)
    route.probing = false
    if (ms === undefined || !Number.isFinite(ms)) return
    this.medians = undefined
    const cost = route.cost
    cost.pages++
    cost.avgMs += (ms - cost.avgMs) / cost.pages
    if (heapBytes !== undefined && Number.isFinite(heapBytes)) {
      cost.avgHeapBytes =
        cost.avgHeapBytes === undefined
          ? heapBytes
          : cost.avgHeapBytes + (heapBytes - cost.avgHeapBytes) / cost.pages
    }
  }

  /** The worker behind `slot` was replaced; let others claim its route. */
  releaseSlot(slot: number) {
    this.release(slot)
  }
}
