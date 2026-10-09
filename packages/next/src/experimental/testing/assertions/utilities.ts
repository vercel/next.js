export interface FakeTimerOptions {
  now?: number | Date
  toFake?: readonly string[]
}

type TimerCallback = (...args: any[]) => void

interface ScheduledTimer {
  id: number
  callback: TimerCallback
  args: any[]
  due: number
  interval?: number
}

const timerNames = [
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'Date',
] as const

/** Attempt-owned utilities. Framework deadlines use separately captured timers. */
export function createAttemptUtilities(assertActive: () => void) {
  const globalDescriptors = new Map<
    PropertyKey,
    PropertyDescriptor | undefined
  >()
  const envValues = new Map<string, string | undefined>()
  const timerDescriptors = new Map<
    PropertyKey,
    PropertyDescriptor | undefined
  >()
  const scheduled = new Map<number, ScheduledTimer>()
  let clockInstalled = false
  let now = Date.now()
  let nextTimerId = 1

  function rememberGlobal(name: PropertyKey) {
    if (!globalDescriptors.has(name)) {
      globalDescriptors.set(
        name,
        Object.getOwnPropertyDescriptor(globalThis, name)
      )
    }
  }

  function stubGlobal(name: string | symbol | number, value: unknown) {
    assertActive()
    rememberGlobal(name)
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    })
    return api
  }

  function stubEnv(name: string, value: string | boolean | undefined) {
    assertActive()
    if (!envValues.has(name)) envValues.set(name, process.env[name])
    if (value === undefined) delete process.env[name]
    else process.env[name] = String(value)
    return api
  }

  function restoreGlobals() {
    for (const [name, descriptor] of globalDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
    globalDescriptors.clear()
  }

  function restoreEnvs() {
    for (const [name, value] of envValues) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    envValues.clear()
  }

  function validateTimerSelection(options?: FakeTimerOptions) {
    const selected = options?.toFake ?? timerNames
    for (const name of selected) {
      if (!(timerNames as readonly string[]).includes(name)) {
        throw new Error(
          `Next test fake timers do not support faking ${JSON.stringify(name)}.`
        )
      }
    }
    return new Set(selected)
  }

  function schedule(
    callback: TimerCallback,
    delay: number | undefined,
    args: any[],
    interval?: number
  ) {
    const id = nextTimerId++
    const duration = Math.max(0, Number(delay) || 0)
    scheduled.set(id, {
      id,
      callback,
      args,
      due: now + duration,
      ...(interval === undefined ? {} : { interval: duration }),
    })
    return id
  }

  function nextTimer(limit = Infinity) {
    let result: ScheduledTimer | undefined
    for (const timer of scheduled.values()) {
      if (timer.due > limit) continue
      if (
        !result ||
        timer.due < result.due ||
        (timer.due === result.due && timer.id < result.id)
      ) {
        result = timer
      }
    }
    return result
  }

  function runUntil(limit: number, onlyPending = false) {
    const pending = onlyPending ? new Set(scheduled.keys()) : undefined
    let turns = 0
    while (true) {
      const timer = nextTimer(limit)
      if (!timer || (pending && !pending.has(timer.id))) break
      if (++turns > 100_000)
        throw new Error('Aborting after running 100000 fake timers.')
      now = timer.due
      if (timer.interval === undefined) scheduled.delete(timer.id)
      else timer.due += timer.interval || 1
      timer.callback(...timer.args)
      pending?.delete(timer.id)
    }
    now = limit
  }

  function install(options?: FakeTimerOptions) {
    assertActive()
    if (clockInstalled) return api
    const selected = validateTimerSelection(options)
    now =
      options?.now instanceof Date
        ? options.now.getTime()
        : (options?.now ?? Date.now())
    for (const name of timerNames) {
      if (selected.has(name)) {
        timerDescriptors.set(
          name,
          Object.getOwnPropertyDescriptor(globalThis, name)
        )
      }
    }
    if (selected.has('setTimeout')) {
      globalThis.setTimeout = ((
        callback: TimerCallback,
        delay?: number,
        ...args: any[]
      ) => schedule(callback, delay, args)) as typeof setTimeout
    }
    if (selected.has('clearTimeout')) {
      globalThis.clearTimeout = ((id: number) => {
        scheduled.delete(Number(id))
      }) as typeof clearTimeout
    }
    if (selected.has('setInterval')) {
      globalThis.setInterval = ((
        callback: TimerCallback,
        delay?: number,
        ...args: any[]
      ) => schedule(callback, delay, args, delay)) as typeof setInterval
    }
    if (selected.has('clearInterval')) {
      globalThis.clearInterval = ((id: number) => {
        scheduled.delete(Number(id))
      }) as typeof clearInterval
    }
    if (selected.has('Date')) {
      const RealDate = Date
      class FakeDate extends RealDate {
        constructor(value?: string | number | Date) {
          if (arguments.length === 0) super(now)
          else
            super(
              value instanceof RealDate
                ? value.getTime()
                : (value as string | number)
            )
        }
        static now() {
          return now
        }
      }
      Object.defineProperty(FakeDate, 'name', { value: 'Date' })
      globalThis.Date = FakeDate as DateConstructor
    }
    clockInstalled = true
    return api
  }

  function restoreTimers() {
    if (!clockInstalled) return
    for (const [name, descriptor] of timerDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
    scheduled.clear()
    timerDescriptors.clear()
    clockInstalled = false
  }

  function requireClock() {
    assertActive()
    if (!clockInstalled)
      throw new Error(
        'Fake timers are not installed. Call vi.useFakeTimers() first.'
      )
  }

  const api = {
    stubGlobal,
    stubEnv,
    unstubAllGlobals() {
      assertActive()
      restoreGlobals()
      return api
    },
    unstubAllEnvs() {
      assertActive()
      restoreEnvs()
      return api
    },
    useFakeTimers: install,
    useRealTimers() {
      assertActive()
      restoreTimers()
      return api
    },
    isFakeTimers() {
      assertActive()
      return clockInstalled
    },
    clearAllTimers() {
      requireClock()
      scheduled.clear()
      return api
    },
    getTimerCount() {
      requireClock()
      return scheduled.size
    },
    getMockedSystemTime() {
      assertActive()
      return clockInstalled ? new Date(now) : null
    },
    getRealSystemTime() {
      assertActive()
      const descriptor = timerDescriptors.get('Date')
      const RealDate = descriptor?.value as DateConstructor | undefined
      return RealDate ? RealDate.now() : Date.now()
    },
    setSystemTime(value: number | string | Date) {
      requireClock()
      now = value instanceof Date ? value.getTime() : new Date(value).getTime()
      return api
    },
    advanceTimersByTime(ms: number) {
      requireClock()
      runUntil(now + ms)
      return api
    },
    async advanceTimersByTimeAsync(ms: number) {
      api.advanceTimersByTime(ms)
      await Promise.resolve()
      return api
    },
    advanceTimersToNextTimer() {
      requireClock()
      const timer = nextTimer()
      if (timer) runUntil(timer.due)
      return api
    },
    async advanceTimersToNextTimerAsync() {
      api.advanceTimersToNextTimer()
      await Promise.resolve()
      return api
    },
    runOnlyPendingTimers() {
      requireClock()
      const timers = [...scheduled.values()]
      const limit = timers.length
        ? Math.max(...timers.map((timer) => timer.due))
        : now
      runUntil(limit, true)
      return api
    },
    async runOnlyPendingTimersAsync() {
      api.runOnlyPendingTimers()
      await Promise.resolve()
      return api
    },
    runAllTimers() {
      requireClock()
      let turns = 0
      while (scheduled.size) {
        if (++turns > 100_000)
          throw new Error('Aborting after running 100000 fake timers.')
        const timer = nextTimer()!
        runUntil(timer.due)
      }
      return api
    },
    async runAllTimersAsync() {
      api.runAllTimers()
      await Promise.resolve()
      return api
    },
    dispose() {
      restoreTimers()
      restoreGlobals()
      restoreEnvs()
    },
  }
  return api
}

export type AttemptUtilities = ReturnType<typeof createAttemptUtilities>
