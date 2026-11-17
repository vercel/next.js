import { RouteQueue, type RouteTask } from './route-queue'

const MB = 1024 * 1024

/** `spec` like { a: 3, b: 2 } → a0 a1 a2 b0 b1, ids in that order. */
function tasksFor(spec: Record<string, number>): RouteTask[] {
  const tasks: RouteTask[] = []
  for (const [route, count] of Object.entries(spec)) {
    for (let i = 0; i < count; i++) tasks.push({ id: tasks.length, route })
  }
  return tasks
}

const ids = (tasks: RouteTask[]) => tasks.map((t) => t.id)

/** Finish pages of `route` taking `ms` each, to teach the queue its cost. */
function completeAll(
  queue: RouteQueue<RouteTask>,
  tasks: RouteTask[],
  ms: number,
  heap?: number
) {
  for (const task of tasks) queue.complete(task, ms, heap)
}

describe('RouteQueue', () => {
  it('lets a free worker claim an unowned route and keep pulling it in order', () => {
    const queue = new RouteQueue(tasksFor({ a: 5, b: 3 }), {
      heavyRouteLimit: false,
    })
    const first = queue.take(0, 2)
    expect(ids(first.tasks)).toEqual([0, 1])
    expect(first.placement).toBe('claim:a')
    expect(queue.ownerOf('a')).toBe(0)

    // Another worker can't claim `a`; it claims `b`.
    const other = queue.take(1, 2)
    expect(ids(other.tasks)).toEqual([5, 6])
    expect(queue.ownerOf('b')).toBe(1)

    // Worker 0 keeps going on `a` from the front.
    const next = queue.take(0, 2)
    expect(ids(next.tasks)).toEqual([2, 3])
    expect(next.placement).toBe('route:a')
  })

  it('claims the next free route once its own route is handed out', () => {
    const queue = new RouteQueue(tasksFor({ a: 2, b: 2, c: 2 }), {
      heavyRouteLimit: false,
    })
    expect(queue.take(0, 2).placement).toBe('claim:a')
    expect(queue.take(1, 1).placement).toBe('claim:b')
    // `a` is fully handed out; worker 0 moves to the free route `c`, not `b`.
    const next = queue.take(0, 2)
    expect(next.placement).toBe('claim:c')
    expect(ids(next.tasks)).toEqual([4, 5])
    expect(queue.ownerOf('a')).toBeUndefined()
  })

  it('helps the owned route with the most remaining work, from the end', () => {
    const queue = new RouteQueue(tasksFor({ a: 10, b: 4 }), {
      heavyRouteLimit: false,
    })
    queue.take(0, 1) // worker 0 owns a: 9 left
    queue.take(1, 1) // worker 1 owns b: 3 left
    // Worker 2 finds nothing free and helps `a` from its end.
    const help = queue.take(2, 3)
    expect(help.placement).toBe('help:a')
    expect(ids(help.tasks)).toEqual([7, 8, 9])
    // The owner continues in order from the front.
    expect(ids(queue.take(0, 2).tasks)).toEqual([1, 2])
    // Ownership doesn't move to the helper.
    expect(queue.ownerOf('a')).toBe(0)
  })

  it('weights remaining work by measured cost when choosing whom to help', () => {
    const queue = new RouteQueue(tasksFor({ a: 10, b: 4, c: 1, d: 1 }), {
      heavyRouteLimit: false,
    })
    const a = queue.take(0, 1).tasks
    const b = queue.take(1, 1).tasks
    // `b` pages are 10x as expensive as `a` pages.
    completeAll(queue, a, 100)
    completeAll(queue, b, 1000)
    completeAll(queue, queue.take(2, 1).tasks, 100) // c
    completeAll(queue, queue.take(2, 1).tasks, 100) // d
    // a: 9 * 100ms left, b: 3 * 1000ms left.
    expect(queue.take(2, 1).placement).toBe('help:b')
  })

  it('is work-conserving: hands out pages while any are left', () => {
    const queue = new RouteQueue(tasksFor({ a: 7, b: 1, c: 3 }), {
      heavyRouteLimit: true,
    })
    const seen = new Set<number>()
    let worker = 0
    while (queue.size > 0) {
      const { tasks } = queue.take(worker, 2)
      expect(tasks.length).toBeGreaterThan(0)
      for (const task of tasks) {
        expect(seen.has(task.id)).toBe(false)
        seen.add(task.id)
      }
      worker = (worker + 1) % 3
    }
    expect(seen.size).toBe(11)
    expect(queue.take(0, 2).tasks).toEqual([])
  })

  it('puts returned pages back in order and lets the owner take them again', () => {
    const queue = new RouteQueue(tasksFor({ a: 5 }), { heavyRouteLimit: false })
    const taken = queue.take(0, 3).tasks
    queue.giveBack([taken[2], taken[0]])
    expect(queue.size).toBe(4)
    expect(ids(queue.take(0, 3).tasks)).toEqual([0, 2, 3])
  })

  it('tracks average render time and memory per route', () => {
    const queue = new RouteQueue(tasksFor({ a: 3 }), { heavyRouteLimit: false })
    const tasks = queue.take(0, 3).tasks
    queue.complete(tasks[0], 100, 10 * MB)
    queue.complete(tasks[1], 300, 30 * MB)
    queue.complete(tasks[2], undefined, undefined)
    expect(queue.costOf('a')).toEqual({
      pages: 2,
      avgMs: 200,
      avgHeapBytes: 20 * MB,
    })
  })

  describe('heavy-route limit', () => {
    // `heavy` pages take 5s, every other route 100ms.
    function setup(heavyRouteLimit: boolean) {
      const queue = new RouteQueue(
        tasksFor({ l1: 1, l2: 1, l3: 1, heavy: 10, heavy2: 10, l4: 2, l5: 2 }),
        { heavyRouteLimit }
      )
      // Measure three light routes so a median exists.
      for (let i = 0; i < 3; i++)
        completeAll(queue, queue.take(0, 1).tasks, 100)
      // Worker 0 claims `heavy` and learns it is heavy.
      const heavy = queue.take(0, 2)
      expect(heavy.placement).toBe('claim:heavy')
      completeAll(queue, heavy.tasks, 5000)
      expect(queue.isHeavy('heavy')).toBe(true)
      return queue
    }

    it('probes an unmeasured big route instead of claiming it blind', () => {
      const queue = setup(true)
      const probe = queue.take(1, 4)
      expect(probe.placement).toBe('probe:heavy2')
      expect(probe.tasks).toHaveLength(1)
      // While the probe runs, worker 1 moves on to light routes.
      expect(queue.take(1, 4).placement).toBe('claim:l4')
      // The probe shows `heavy2` is heavy too.
      completeAll(queue, probe.tasks, 5000)
      expect(queue.isHeavy('heavy2')).toBe(true)
    })

    it('keeps a second worker on light routes while a heavy route renders elsewhere', () => {
      const queue = setup(true)
      completeAll(queue, queue.take(1, 1).tasks, 5000) // probe heavy2
      const picks = [queue.take(1, 2), queue.take(1, 2)]
      expect(picks.map((p) => p.placement)).toEqual(['claim:l4', 'claim:l5'])
      // No light routes left: work conservation wins and worker 1 takes the
      // second heavy route.
      expect(queue.take(1, 2).placement).toBe('claim:heavy2')
    })

    it('lets only the later claim yield when two heavy routes were claimed blind', () => {
      const queue = new RouteQueue(
        tasksFor({ l1: 1, l2: 1, l3: 1, h1: 10, h2: 10, l4: 3 }),
        { heavyRouteLimit: true }
      )
      for (let i = 0; i < 3; i++)
        completeAll(queue, queue.take(0, 1).tasks, 100)
      // Neither route is known to be heavy yet, so both get claimed.
      const first = queue.take(0, 2)
      const second = queue.take(1, 2)
      expect([first.placement, second.placement]).toEqual([
        'claim:h1',
        'claim:h2',
      ])
      completeAll(queue, [...first.tasks, ...second.tasks], 5000)
      // Worker 0 claimed first and keeps its route; worker 1 sets its route
      // aside for the light route that is still waiting.
      expect(queue.take(0, 2).placement).toBe('route:h1')
      expect(queue.take(1, 2).placement).toBe('claim:l4')
      expect(queue.ownerOf('h2')).toBeUndefined()
    })

    it('helps a light route rather than start a second heavy route', () => {
      const queue = new RouteQueue(
        tasksFor({ l1: 1, l2: 1, l3: 1, heavy: 10, heavy2: 10, l4: 3 }),
        { heavyRouteLimit: true }
      )
      for (let i = 0; i < 3; i++)
        completeAll(queue, queue.take(0, 1).tasks, 100)
      const heavy = queue.take(0, 2)
      completeAll(queue, heavy.tasks, 5000)
      const probe = queue.take(1, 1)
      expect(probe.placement).toBe('probe:heavy2')
      completeAll(queue, probe.tasks, 5000)
      expect(queue.take(2, 1).placement).toBe('claim:l4')
      // Only the heavy route is unclaimed, but `l4` still has pages waiting.
      const help = queue.take(1, 2)
      expect(help.placement).toBe('help:l4')
      expect(ids(help.tasks)).toEqual([24, 25])
      // Once no light pages wait, work conservation wins.
      expect(queue.take(1, 2).placement).toBe('claim:heavy2')
    })

    it('does nothing special when the limit is off', () => {
      const queue = setup(false)
      expect(queue.take(1, 4).placement).toBe('claim:heavy2')
    })

    it('treats a route as heavy by memory as well as time', () => {
      const queue = new RouteQueue(tasksFor({ a: 1, b: 1, c: 1, big: 3 }), {
        heavyRouteLimit: true,
      })
      for (let i = 0; i < 3; i++) {
        completeAll(queue, queue.take(0, 1).tasks, 100, 20 * MB)
      }
      completeAll(queue, queue.take(0, 1).tasks, 100, 200 * MB)
      expect(queue.isHeavy('big')).toBe(true)
    })
  })
})
