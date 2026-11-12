/**
 * Next.js test clock, derived from @sinonjs/fake-timers 15.4.0.
 * Copyright (c) 2010-2014, Christian Johansen. All rights reserved.
 * See LICENSE in this directory for the BSD-3-Clause license.
 */

const globalObject = globalThis

/**
 * @typedef {"nextAsync" | "manual" | "interval"} TickMode
 */

/**
 * @typedef {object} NextAsyncTickMode
 * @property {"nextAsync"} mode - runs timers one macrotask at a time
 */

/**
 * @typedef {object} ManualTickMode
 * @property {"manual"} mode - advances only when the caller explicitly ticks
 */

/**
 * @typedef {object} IntervalTickMode
 * @property {"interval"} mode - advances automatically on a native interval
 * @property {number} [delta] - interval duration in milliseconds
 */

/**
 * @typedef {IntervalTickMode | NextAsyncTickMode | ManualTickMode} TimerTickMode
 */

/**
 * @callback FakeTimersFunction
 * @param {...unknown[]} args
 * @returns {unknown}
 */

/**
 * @callback VoidVarArgsFunc
 * @param {...unknown[]} args - optional arguments to call the callback with
 * @returns {void}
 */

/**
 * @callback NextTick
 * @param {VoidVarArgsFunc} callback - the callback to run
 * @param {...unknown[]} args - optional arguments to call the callback with
 * @returns {void}
 */

/**
 * @callback SetImmediate
 * @param {VoidVarArgsFunc} callback - the callback to run
 * @param {...unknown[]} args - optional arguments to call the callback with
 * @returns {NodeImmediate}
 */

/**
 * @callback SetTimeout
 * @param {VoidVarArgsFunc} callback - the callback to run
 * @param {number} [delay] - optional delay in milliseconds
 * @param {...unknown[]} args - optional arguments to call the callback with
 * @returns {TimerId} - the timeout identifier
 */

/**
 * @callback ClearTimeout
 * @param {TimerId} [id] - the timeout identifier to clear
 * @returns {void}
 */

/**
 * @callback SetInterval
 * @param {VoidVarArgsFunc} callback - the callback to run
 * @param {number} [delay] - optional delay in milliseconds
 * @param {...unknown[]} args - optional arguments to call the callback with
 * @returns {TimerId} - the interval identifier
 */

/**
 * @callback ClearInterval
 * @param {TimerId} [id] - the interval identifier to clear
 * @returns {void}
 */

/**
 * @callback QueueMicrotask
 * @param {VoidVarArgsFunc} callback - the callback to run
 * @returns {void}
 */

/**
 * @callback TimeRemaining
 * @returns {number}
 */

/**
 * @typedef {object} IdleDeadline
 * @property {boolean} didTimeout - whether or not the callback was called before reaching the optional timeout
 * @property {TimeRemaining} timeRemaining - a floating-point value providing an estimate of the number of milliseconds remaining in the current idle period
 */

/**
 * @callback RequestIdleCallbackCallback
 * @param {IdleDeadline} deadline
 */

/**
 * Queues a function to be called during a browser's idle periods
 * @callback RequestIdleCallback
 * @param {RequestIdleCallbackCallback} callback
 * @param {{timeout?: number}} [options] - an options object
 * @returns {number} the id
 */

/**
 * @callback AnimationFrameCallback
 * @param {number} timestamp
 */

/**
 * @callback RequestAnimationFrame
 * @param {AnimationFrameCallback} callback
 * @returns {TimerId} - the request id
 */

/**
 * @callback CancelAnimationFrame
 * @param {TimerId} id - cancels a frame callback
 * @returns {void}
 */

/**
 * @callback CancelIdleCallback
 * @param {TimerId} id - cancels a scheduled idle callback
 * @returns {void}
 */

/**
 * @callback ClearImmediate
 * @param {NodeImmediate} id - faked `clearImmediate`
 * @returns {void}
 */

/**
 * @callback CountTimers
 * @returns {number}
 */

/**
 * @callback RunMicrotasks
 * @returns {void}
 */

/**
 * @typedef {object} TemporalDuration
 * @property {number} years - years component
 * @property {number} months - months component
 * @property {number} weeks - weeks component
 * @property {number} days - days component
 * @property {number} hours - hours component
 * @property {number} minutes - minutes component
 * @property {number} seconds - seconds component
 * @property {number} milliseconds - milliseconds component
 * @property {number} microseconds - microseconds component
 * @property {number} nanoseconds - nanoseconds component
 * @property {(options: {unit: string, relativeTo?: unknown}) => number} total - converts to a single unit
 */

/**
 * @typedef {object} TemporalTimelike
 * @property {number} epochMilliseconds - milliseconds since the Unix epoch (present on Temporal.Instant and Temporal.ZonedDateTime)
 */

/**
 * @callback Tick
 * @param {number|string|TemporalDuration} tickValue milliseconds, a string parseable by parseTime, or a Temporal.Duration
 * @returns {number} will return the new `now` value
 */

/**
 * @callback TickAsync
 * @param {number|string|TemporalDuration} tickValue milliseconds, a string parseable by parseTime, or a Temporal.Duration
 * @returns {Promise<number>}
 */

/**
 * @callback Next
 * @returns {number}
 */

/**
 * @callback NextAsync
 * @returns {Promise<number>}
 */

/**
 * @callback RunAll
 * @returns {number}
 */

/**
 * @callback RunToFrame
 * @returns {number}
 */

/**
 * @callback RunAllAsync
 * @returns {Promise<number>}
 */

/**
 * @callback RunToLast
 * @returns {number}
 */

/**
 * @callback RunToLastAsync
 * @returns {Promise<number>}
 */

/**
 * @callback Reset
 * @returns {void}
 */

/**
 * @callback SetSystemTime
 * @param {number|Date|TemporalTimelike} [now] initial mocked time, as milliseconds since epoch, a Date, a Temporal.Instant, or a Temporal.ZonedDateTime
 * @returns {void}
 */

/**
 * @callback Jump
 * @param {number|string|TemporalDuration} tickValue milliseconds, a human-readable value like "01:11:15", or a Temporal.Duration
 * @returns {number}
 */

/**
 * @callback Uninstall
 * @returns {void}
 */

/**
 * @callback SetTickMode
 * @param {SetTickModeConfig} tickModeConfig - The new configuration for how the clock should tick.
 * @returns {void}
 */

/**
 * @callback Hrtime
 * @param {Array<number>} [prev]
 * @returns {Array<number>}
 */

/**
 * @callback WithGlobal
 * @param {object} _global Namespace to mock (e.g. `window`)
 * @returns {FakeTimers}
 */

/**
 * @typedef {"setTimeout" | "clearTimeout" | "setImmediate" | "clearImmediate" | "setInterval" | "clearInterval" | "Date" | "nextTick" | "hrtime" | "requestAnimationFrame" | "cancelAnimationFrame" | "requestIdleCallback" | "cancelIdleCallback" | "performance" | "queueMicrotask" | "Intl" | "Temporal"} FakeMethod
 */

/**
 * @typedef {number | NodeImmediate | Timer} TimerId
 */

/**
 * @typedef {Record<string, any> & {
 *   setTimeout?: SetTimeout,
 *   clearTimeout?: ClearTimeout,
 *   setInterval?: SetInterval,
 *   clearInterval?: ClearInterval,
 *   setImmediate?: SetImmediate,
 *   clearImmediate?: ClearImmediate,
 *   queueMicrotask?: QueueMicrotask,
 *   requestAnimationFrame?: RequestAnimationFrame,
 *   cancelAnimationFrame?: CancelAnimationFrame,
 *   requestIdleCallback?: RequestIdleCallback,
 *   cancelIdleCallback?: CancelIdleCallback,
 *   process?: any,
 *   performance?: any,
 *   Performance?: any,
 *   Intl?: any,
 *   Temporal?: any,
 *   Promise?: typeof Promise,
 *   Date: typeof Date & { isFake?: boolean, toSource?: () => string, clock?: any }
 * }} GlobalObject
 */

/**
 * @typedef {object} TimerHeap
 * @property {Timer[]} timers - the heap-ordered timers
 * @property {() => Timer | undefined} peek - returns the next timer without removing it
 * @property {(timer: Timer) => void} push - adds a timer to the heap
 * @property {() => Timer | undefined} pop - removes and returns the next timer
 * @property {(timer: Timer) => void} remove - removes a specific timer
 */

/**
 * @typedef {object} ClockTickMode
 * @property {TickMode} mode - active tick mode
 * @property {number} counter - increments whenever the mode changes
 * @property {number} [delta] - interval length in milliseconds
 */

/**
 * @typedef {object} SetTickModeConfig
 * @property {TickMode} mode - desired tick mode
 * @property {number} [delta] - interval length in milliseconds
 */

/**
 * @typedef {Record<string, any> & { clock: Clock }} IntlWithClock
 */

/**
 * @typedef {Record<string, any> & { now: () => number }} PerformanceLike
 */

/**
 * @typedef {object} Timers
 * @property {SetTimeout} setTimeout - native `setTimeout`
 * @property {ClearTimeout} clearTimeout - native `clearTimeout`
 * @property {SetInterval} setInterval - native `setInterval`
 * @property {ClearInterval} clearInterval - native `clearInterval`
 * @property {typeof Date} Date - native `Date`
 * @property {typeof Intl} [Intl] - native `Intl`
 * @property {any} [Temporal] - native `Temporal`
 * @property {SetImmediate} [setImmediate] - native `setImmediate`, if available
 * @property {ClearImmediate} [clearImmediate] - native `clearImmediate`, if available
 * @property {Hrtime} [hrtime] - native `process.hrtime`, if available
 * @property {NextTick} [nextTick] - native `process.nextTick`, if available
 * @property {PerformanceLike} [performance] - native `performance`, if available
 * @property {RequestAnimationFrame} [requestAnimationFrame] - native `requestAnimationFrame`, if available
 * @property {QueueMicrotask} [queueMicrotask] - whether `queueMicrotask` exists
 * @property {CancelAnimationFrame} [cancelAnimationFrame] - native `cancelAnimationFrame`, if available
 * @property {RequestIdleCallback} [requestIdleCallback] - native `requestIdleCallback`, if available
 * @property {CancelIdleCallback} [cancelIdleCallback] - native `cancelIdleCallback`, if available
 */

/**
 * @typedef {object} ClockState
 * @property {number} tickFrom - lower bound of the current tick range
 * @property {number} tickTo - upper bound of the current tick range
 * @property {number} [previous] - previous timer time used during ticking
 * @property {number | null} [oldNow] - previous value of `now`
 * @property {Timer} [timer] - timer currently being processed
 * @property {unknown} [firstException] - first exception raised while processing timers
 * @property {number} [nanosTotal] - accumulated nanoseconds from fractional ticks
 * @property {number} [msFloat] - accumulated fractional milliseconds
 * @property {number} [ms] - accumulated whole milliseconds
 */

/**
 * @typedef {object} TimerInitialProps
 * @property {VoidVarArgsFunc} func - callback or string to execute
 * @property {unknown[]} [args] - arguments passed to the callback
 * @property {'Timeout' | 'Interval' | 'Immediate' | 'AnimationFrame' | 'IdleCallback'} [type] - timer kind
 * @property {number} [delay] - requested delay in milliseconds
 * @property {number} [callAt] - scheduled execution time
 * @property {number} [createdAt] - time at which the timer was created
 * @property {boolean} [immediate] - whether this timer should run before non-immediate timers at the same time
 * @property {number} [id] - unique timer identifier
 * @property {Error} [error] - captured stack for loop diagnostics
 * @property {number} [interval] - interval for repeated timers
 * @property {boolean} [animation] - whether this is an animation frame timer
 * @property {boolean} [requestIdleCallback] - whether this is an idle callback timer
 * @property {number} [order] - execution order for timers at the same time
 * @property {number} [heapIndex] - index in the timer heap
 */

/**
 * @callback CreateClockCallback
 * @param {number|Date|TemporalTimelike} [start] initial mocked time, as milliseconds since epoch, a Date, a Temporal.Instant, or a Temporal.ZonedDateTime
 * @param {number} [loopLimit] maximum number of timers run before aborting with an infinite-loop error
 * @returns {Clock}
 */

/**
 * @callback InstallCallback
 * @param {Config} [config] Optional config
 * @returns {Clock}
 */

/**
 * @typedef {object} FakeTimers
 * @property {Timers} timers - the native timer APIs saved for later restoration
 * @property {CreateClockCallback} createClock - creates a new fake clock
 * @property {InstallCallback} install - installs the fake timers onto the default global object
 * @property {WithGlobal} withGlobal - creates a fake-timers instance for a provided global object
 */

/**
 * @typedef {object} Clock
 * @property {number} now - current mocked time in milliseconds
 * @property {typeof Date & {clock?: Clock, isFake?: boolean, toSource?: () => string}} Date - fake Date constructor bound to this clock
 * @property {number} loopLimit - maximum number of timers before assuming an infinite loop
 * @property {RequestIdleCallback} requestIdleCallback - schedules an idle callback
 * @property {CancelIdleCallback} cancelIdleCallback - cancels a scheduled idle callback
 * @property {SetTimeout} setTimeout - faked `setTimeout`
 * @property {ClearTimeout} clearTimeout - faked `clearTimeout`
 * @property {NextTick} nextTick - faked `process.nextTick`
 * @property {QueueMicrotask} queueMicrotask - faked `queueMicrotask`
 * @property {SetInterval} setInterval - faked `setInterval`
 * @property {ClearInterval} clearInterval - faked `clearInterval`
 * @property {SetImmediate} setImmediate - faked `setImmediate`
 * @property {ClearImmediate} clearImmediate - faked `clearImmediate`
 * @property {CountTimers} countTimers - counts scheduled timers
 * @property {RequestAnimationFrame} requestAnimationFrame - schedules a frame callback
 * @property {CancelAnimationFrame} cancelAnimationFrame - cancels a frame callback
 * @property {RunMicrotasks} runMicrotasks - drains microtasks
 * @property {Tick} tick - advances fake time synchronously
 * @property {TickAsync} tickAsync - advances fake time asynchronously
 * @property {Next} next - runs the next scheduled timer
 * @property {NextAsync} nextAsync - runs the next scheduled timer asynchronously
 * @property {RunAll} runAll - runs all scheduled timers
 * @property {RunToFrame} runToFrame - runs timers up to the next animation frame
 * @property {RunAllAsync} runAllAsync - runs all scheduled timers asynchronously
 * @property {RunToLast} runToLast - runs timers up to the last scheduled timer
 * @property {RunToLastAsync} runToLastAsync - runs timers up to the last scheduled timer asynchronously
 * @property {Reset} reset - clears all timers and resets the clock
 * @property {SetSystemTime} setSystemTime - sets the clock to a specific wall-clock time
 * @property {Jump} jump - advances time and returns the new `now`
 * @property {any} performance - fake performance object
 * @property {Hrtime} hrtime - faked `process.hrtime`
 * @property {Uninstall} uninstall - restores native timers
 * @property {string[]} methods - names of faked methods
 * @property {boolean} [shouldClearNativeTimers] - inherited from config
 * @property {{methodName:string, original:unknown}[] | undefined} timersModuleMethods - saved Node timers module methods
 * @property {{methodName:string, original:unknown}[] | undefined} timersPromisesModuleMethods - saved Node timers/promises methods
 * @property {Map<VoidVarArgsFunc, AbortSignal>} abortListenerMap - active abort listeners
 * @property {SetTickMode} setTickMode - switches the auto-tick mode
 * @property {Map<number, Timer>} [timers] - internal timer storage
 * @property {TimerHeap} [timerHeap] - internal timer heap
 * @property {boolean} [duringTick] - internal flag
 * @property {boolean} isNearInfiniteLimit - internal flag indicating the loop limit is nearly reached
 * @property {TimerId} [attachedInterval] - internal flag
 * @property {ClockTickMode} [tickMode] - internal flag
 * @property {Timer[]} [jobs] - internal flag
 * @property {IntlWithClock} [Intl] - fake Intl object
 * @property {any} [Temporal] - fake Temporal object
 */

/**
 * Configuration object for the `install` method.
 * @typedef {object} Config
 * @property {number|Date|TemporalTimelike} [now] initial mocked time, as milliseconds since epoch, a Date, a Temporal.Instant, or a Temporal.ZonedDateTime
 * @property {FakeMethod[]} [toFake] method names that should be faked
 * @property {FakeMethod[]} [toNotFake] method names that should remain native
 * @property {number} [loopLimit] maximum number of timers run before aborting with an infinite-loop error
 * @property {boolean} [shouldAdvanceTime] automatically increments mocked time while the clock is installed
 * @property {number} [advanceTimeDelta] interval in milliseconds used when `shouldAdvanceTime` is enabled
 * @property {boolean} [shouldClearNativeTimers] forwards clear calls to native methods when the timer is not fake
 * @property {boolean} [ignoreMissingTimers] suppresses errors when a requested timer is missing from the global object
 * @property {GlobalObject} [target] global object to install onto
 */

/**
 * The internal structure to describe a scheduled fake timer
 * @typedef {TimerInitialProps} Timer
 * @property {unknown[]} args - arguments passed to the callback
 * @property {number} callAt - scheduled execution time
 * @property {number} createdAt - time at which the timer was created
 * @property {number} id - unique timer identifier
 * @property {'Timeout' | 'Interval' | 'Immediate' | 'AnimationFrame' | 'IdleCallback'} type - timer kind
 */

/**
 * @callback NodeImmediateHasRef
 * @returns {boolean}
 */

/**
 * @callback NodeImmediateRef
 * @returns {NodeImmediate}
 */

/**
 * @callback NodeImmediateUnref
 * @returns {NodeImmediate}
 */

/**
 * A Node timer
 * @typedef {object} NodeImmediate
 * @property {NodeImmediateHasRef} hasRef - reports whether the timer keeps the event loop alive
 * @property {NodeImmediateRef} ref - marks the timer as referenced
 * @property {NodeImmediateUnref} unref - marks the timer as unreferenced
 */

/**
 * Mocks available features in the specified global namespace.
 * @param {GlobalObject} _global Namespace to mock (e.g. `window`)
 * @param {{timers: object, timersPromises: object, util: object}} [bridge] Node
 * timer modules supplied by the host. Browser contexts omit this parameter.
 * @returns {FakeTimers}
 */
export function createTimerContext(_global, bridge) {
  let timersModule, timersPromisesModule
  if (bridge) {
    try {
      timersModule = bridge.timers
    } catch {
      // The supplied host may not expose its Node timers module.
    }
    try {
      timersPromisesModule = bridge.timersPromises
    } catch {
      // The supplied host may not expose its Node promises module.
    }
  }
  const maxTimeout = Math.pow(2, 31) - 1 //see https://heycam.github.io/webidl/#abstract-opdef-converttoint
  const idCounterStart = 1e12 // arbitrarily large number to avoid collisions with native timer IDs
  const NOOP = function () {
    return undefined
  }
  const NOOP_ARRAY = function () {
    return []
  }
  const isPresent = {}
  let timeoutResult,
    addTimerReturnsObject = false

  if (_global.setTimeout) {
    isPresent.setTimeout = true
    timeoutResult = _global.setTimeout(NOOP, 0)
    addTimerReturnsObject = typeof timeoutResult === 'object'
  }
  isPresent.clearTimeout = Boolean(_global.clearTimeout)
  isPresent.setInterval = Boolean(_global.setInterval)
  isPresent.clearInterval = Boolean(_global.clearInterval)
  isPresent.hrtime =
    _global.process && typeof _global.process.hrtime === 'function'
  isPresent.hrtimeBigint =
    isPresent.hrtime && typeof _global.process.hrtime.bigint === 'function'
  isPresent.nextTick =
    _global.process && typeof _global.process.nextTick === 'function'
  const utilPromisify = _global.process && bridge && bridge.util.promisify
  isPresent.performance =
    _global.performance && typeof _global.performance.now === 'function'
  const hasPerformancePrototype =
    _global.Performance &&
    (typeof _global.Performance).match(/^(function|object)$/)
  const hasPerformanceConstructorPrototype =
    _global.performance &&
    _global.performance.constructor &&
    _global.performance.constructor.prototype
  isPresent.queueMicrotask = Object.prototype.hasOwnProperty.call(
    _global,
    'queueMicrotask'
  )
  isPresent.requestAnimationFrame =
    _global.requestAnimationFrame &&
    typeof _global.requestAnimationFrame === 'function'
  isPresent.cancelAnimationFrame =
    _global.cancelAnimationFrame &&
    typeof _global.cancelAnimationFrame === 'function'
  isPresent.requestIdleCallback =
    _global.requestIdleCallback &&
    typeof _global.requestIdleCallback === 'function'
  isPresent.cancelIdleCallback =
    _global.cancelIdleCallback &&
    typeof _global.cancelIdleCallback === 'function'
  isPresent.setImmediate =
    _global.setImmediate && typeof _global.setImmediate === 'function'
  isPresent.clearImmediate =
    _global.clearImmediate && typeof _global.clearImmediate === 'function'
  isPresent.Intl = _global.Intl && typeof _global.Intl === 'object'
  isPresent.Temporal =
    _global.Temporal !== null &&
    typeof _global.Temporal === 'object' &&
    typeof _global.Temporal.Now !== 'undefined' &&
    typeof _global.Temporal.Instant !== 'undefined'

  if (_global.clearTimeout) {
    _global.clearTimeout(timeoutResult)
  }

  const NativeDate = _global.Date
  const NativeIntl = isPresent.Intl
    ? Object.defineProperties(
        Object.create(null),
        Object.getOwnPropertyDescriptors(_global.Intl)
      )
    : undefined
  const NativeTemporal = isPresent.Temporal ? _global.Temporal : undefined
  let uniqueTimerId = idCounterStart
  /** @type {number} */
  let uniqueTimerOrder = 0

  if (NativeDate === undefined) {
    throw new Error(
      "The global scope doesn't have a `Date` object" +
        ' (see https://github.com/sinonjs/sinon/issues/1852#issuecomment-419622780)'
    )
  }
  isPresent.Date = true

  /**
   * The PerformanceEntry object encapsulates a single performance metric
   * that is part of the browser's performance timeline.
   *
   * This is an object returned by the `mark` and `measure` methods on the Performance prototype
   */
  class FakePerformanceEntry {
    constructor(name, entryType, startTime, duration) {
      this.name = name
      this.entryType = entryType
      this.startTime = startTime
      this.duration = duration
    }

    toJSON() {
      return JSON.stringify({ ...this })
    }
  }

  /**
   * @param {number} num
   * @returns {boolean}
   */
  function isNumberFinite(num) {
    if (Number.isFinite) {
      return Number.isFinite(num)
    }

    return isFinite(num)
  }

  /**
   * @param {Clock} clock
   * @param {number} i
   */
  function checkIsNearInfiniteLimit(clock, i) {
    if (clock.loopLimit && i === clock.loopLimit - 1) {
      clock.isNearInfiniteLimit = true
    }
  }

  /**
   * @param {Clock} clock
   */
  function resetIsNearInfiniteLimit(clock) {
    if (clock) {
      clock.isNearInfiniteLimit = false
    }
  }

  /**
   * Parse strings like "01:10:00" (meaning 1 hour, 10 minutes, 0 seconds) into
   * number of milliseconds. This is used to support human-readable strings passed
   * to clock.tick()
   * @param {string} str
   * @returns {number}
   */
  function parseTime(str) {
    if (!str) {
      return 0
    }

    const strings = str.split(':')
    const l = strings.length
    let i = l
    let ms = 0
    let parsed

    if (l > 3 || !/^(\d\d:){0,2}\d\d?$/.test(str)) {
      throw new Error(
        "tick only understands numbers, 'm:s' and 'h:m:s'. Each part must be two digits"
      )
    }

    while (i--) {
      parsed = parseInt(strings[i], 10)

      if (parsed >= 60) {
        throw new Error(`Invalid time ${str}`)
      }

      ms += parsed * Math.pow(60, l - i - 1)
    }

    return ms * 1000
  }

  /**
   * Get the decimal part of the millisecond value as nanoseconds
   * @param {number} msFloat the number of milliseconds
   * @returns {number} an integer number of nanoseconds in the range [0,1e6)
   *
   * Example: nanoRemainer(123.456789) -> 456789
   */
  function nanoRemainder(msFloat) {
    const modulo = 1e6
    const remainder = (msFloat * 1e6) % modulo
    const positiveRemainder = remainder < 0 ? remainder + modulo : remainder

    return Math.floor(positiveRemainder)
  }

  /**
   * Used to grok the `now` parameter to createClock.
   * @param {Date|number|TemporalTimelike} epoch the system time
   * @returns {number}
   */
  function getEpoch(epoch) {
    if (!epoch) {
      return 0
    }
    if (typeof epoch === 'number') {
      return epoch
    }
    if (typeof (/** @type {Date} */ (epoch).getTime) === 'function') {
      return /** @type {Date} */ (epoch).getTime()
    }
    if (
      typeof (/** @type {TemporalTimelike} */ (epoch).epochMilliseconds) ===
      'number'
    ) {
      // Temporal.Instant and Temporal.ZonedDateTime both have epochMilliseconds
      return /** @type {TemporalTimelike} */ (epoch).epochMilliseconds
    }
    throw new TypeError('now should be milliseconds since UNIX epoch')
  }

  /**
   * @param {number} from
   * @param {number} to
   * @param {Timer} timer
   * @returns {boolean}
   */
  function inRange(from, to, timer) {
    return timer && timer.callAt >= from && timer.callAt <= to
  }

  /**
   * @param {Clock} clock
   * @param {Timer} job
   * @returns {Error}
   */
  function getInfiniteLoopError(clock, job) {
    const infiniteLoopError = new Error(
      `Aborting after running ${clock.loopLimit} timers, assuming an infinite loop!`
    )

    if (!job.error) {
      return infiniteLoopError
    }

    // pattern never matched in Node
    const computedTargetPattern = /target\.*[<|(|[].*?[>|\]|)]\s*/
    let clockMethodPattern = new RegExp(String(Object.keys(clock).join('|')))

    if (addTimerReturnsObject) {
      // node.js environment
      clockMethodPattern = new RegExp(
        `\\s+at (Object\\.)?(?:${Object.keys(clock).join('|')})\\s+`
      )
    }

    let matchedLineIndex = -1
    job.error.stack.split('\n').some(function (line, i) {
      // If we've matched a computed target line (e.g. setTimeout) then we
      // don't need to look any further. Return true to stop iterating.
      const matchedComputedTarget = line.match(computedTargetPattern)
      /* istanbul ignore if */
      if (matchedComputedTarget) {
        matchedLineIndex = i
        return true
      }

      // If we've matched a clock method line, then there may still be
      // others further down the trace. Return false to keep iterating.
      const matchedClockMethod = line.match(clockMethodPattern)
      if (matchedClockMethod) {
        matchedLineIndex = i
        return false
      }

      // If we haven't matched anything on this line, but we matched
      // previously and set the matched line index, then we can stop.
      // If we haven't matched previously, then we should keep iterating.
      return matchedLineIndex >= 0
    })

    const stack = `${infiniteLoopError}\n${job.type || 'Microtask'} - ${
      job.func.name || 'anonymous'
    }\n${job.error.stack
      .split('\n')
      .slice(matchedLineIndex + 1)
      .join('\n')}`

    try {
      Object.defineProperty(infiniteLoopError, 'stack', {
        value: stack,
      })
    } catch {
      // noop
    }

    return infiniteLoopError
  }

  /**
   * @returns {typeof Date & { clock: Clock }}
   */
  function createDate() {
    class ClockDate extends NativeDate {
      /** @type {Clock} */
      static clock

      constructor(...args) {
        // Preserve fake time when Date is called without arguments.
        if (args.length === 0) {
          super(ClockDate.clock.now)
        } else {
          // The subclass is intentionally thin for explicit args.
          // @ts-expect-error Date constructor overloads are intentionally dynamic.
          super(...args)
        }

        // ensures identity checks using the constructor prop still works
        // this should have no other functional effect
        Object.defineProperty(this, 'constructor', {
          value: NativeDate,
          enumerable: false,
        })
      }

      static [Symbol.hasInstance](instance) {
        return instance instanceof NativeDate
      }
    }

    ClockDate.isFake = true

    if (NativeDate.now) {
      ClockDate.now = function now() {
        return ClockDate.clock.now
      }
    }

    const NativeDateWithToSource =
      /** @type {typeof Date & { toSource?: () => string }} */ (NativeDate)

    if (NativeDateWithToSource.toSource) {
      ClockDate.toSource = function toSource() {
        return NativeDateWithToSource.toSource()
      }
    }

    ClockDate.toString = function toString() {
      return NativeDateWithToSource.toString()
    }

    // noinspection UnnecessaryLocalVariableJS
    /**
     * A normal Class constructor cannot be called without `new`, but Date can, so we need
     * to wrap it in a Proxy in order to ensure this functionality of Date is kept intact
     * @type {typeof ClockDate}
     */
    const ClockDateProxy = new Proxy(ClockDate, {
      // handler for [[Call]] invocations (i.e. not using `new`)
      apply() {
        // the Date constructor called as a function, ref Ecma-262 Edition 5.1, section 15.9.2.
        // This remains so in the 10th edition of 2019 as well.
        if (this instanceof ClockDate) {
          throw new TypeError(
            'A Proxy should only capture `new` calls with the `construct` handler. This is not supposed to be possible, so check the logic.'
          )
        }

        return new NativeDate(ClockDate.clock.now).toString()
      },
    })

    return /** @type {typeof Date & { clock: Clock }} */ (
      /** @type {unknown} */ (ClockDateProxy)
    )
  }

  /**
   * Mirror Intl by default on our fake implementation
   *
   * Most of the properties are the original native ones,
   * but we need to take control of those that have a
   * dependency on the current clock.
   * @param {Clock} clock
   * @returns {IntlWithClock} the partly fake Intl implementation
   */
  function createIntl(clock) {
    /** @type {IntlWithClock} */
    const IntlWithClock = { clock: clock }
    /*
     * All properties of Intl are non-enumerable, so we need
     * to do a bit of work to get them out.
     */
    Object.getOwnPropertyNames(NativeIntl).forEach(
      (property) => (IntlWithClock[property] = NativeIntl[property])
    )

    IntlWithClock.DateTimeFormat = function (...args) {
      const realFormatter = new NativeIntl.DateTimeFormat(...args)
      const formatter = {}

      ;['formatRange', 'formatRangeToParts', 'resolvedOptions'].forEach(
        (method) => {
          formatter[method] = realFormatter[method].bind(realFormatter)
        }
      )
      ;['format', 'formatToParts'].forEach((method) => {
        formatter[method] = function (date) {
          return realFormatter[method](date || IntlWithClock.clock.now)
        }
      })

      return formatter
    }

    IntlWithClock.DateTimeFormat.prototype = Object.create(
      NativeIntl.DateTimeFormat.prototype
    )

    IntlWithClock.DateTimeFormat.supportedLocalesOf =
      NativeIntl.DateTimeFormat.supportedLocalesOf

    return IntlWithClock
  }

  function createTemporal(clock, getNanos) {
    const fakeNow = {
      instant() {
        return NativeTemporal.Instant.fromEpochNanoseconds(
          BigInt(clock.now) * 1_000_000n + BigInt(getNanos())
        )
      },
      timeZoneId() {
        return NativeTemporal.Now.timeZoneId()
      },
      zonedDateTimeISO(timeZone) {
        const tz = timeZone ?? NativeTemporal.Now.timeZoneId()
        return fakeNow.instant().toZonedDateTimeISO(tz)
      },
      plainDateTimeISO(timeZone) {
        return fakeNow.zonedDateTimeISO(timeZone).toPlainDateTime()
      },
      plainDateISO(timeZone) {
        return fakeNow.zonedDateTimeISO(timeZone).toPlainDate()
      },
      plainTimeISO(timeZone) {
        return fakeNow.zonedDateTimeISO(timeZone).toPlainTime()
      },
    }

    const TemporalWithClock = Object.create(
      Object.getPrototypeOf(NativeTemporal)
    )
    ;[
      ...Object.getOwnPropertyNames(NativeTemporal),
      ...Object.getOwnPropertySymbols(NativeTemporal),
    ].forEach((prop) => {
      Object.defineProperty(
        TemporalWithClock,
        prop,
        Object.getOwnPropertyDescriptor(NativeTemporal, prop)
      )
    })
    // Temporal.Now is writable:false in the spec so we must use defineProperty
    Object.defineProperty(TemporalWithClock, 'Now', {
      value: fakeNow,
      writable: true,
      enumerable: false,
      configurable: true,
    })

    return TemporalWithClock
  }

  function enqueueJob(clock, job) {
    // enqueues a microtick-deferred task - ecma262/#sec-enqueuejob
    if (!clock.jobs) {
      clock.jobs = []
    }
    clock.jobs.push(job)
  }

  function runJobs(clock) {
    // runs all microtick-deferred tasks - ecma262/#sec-runjobs
    if (!clock.jobs) {
      return
    }
    const wasNearLimit = clock.isNearInfiniteLimit
    for (let i = 0; i < clock.jobs.length; i++) {
      const job = clock.jobs[i]
      job.func.apply(null, job.args)

      checkIsNearInfiniteLimit(clock, i)
      if (clock.loopLimit && i > clock.loopLimit) {
        throw getInfiniteLoopError(clock, job)
      }
    }
    if (!wasNearLimit) {
      resetIsNearInfiniteLimit(clock)
    }
    clock.jobs = []
  }

  /**
   * A compact "soonest timer first" container.
   *
   * Think of this as a waiting room for scheduled callbacks where the next
   * callback to run is always kept at the front of the list. The internal
   * array is arranged so we can find, add, remove, and reorder timers
   * efficiently without sorting the whole list every time something changes.
   *
   * The important idea is not the data structure name, but the behavior:
   * the timer that should run next stays near the front, and when one timer
   * moves, the rest are shifted just enough to keep that promise true.
   */
  class TimerHeap {
    constructor() {
      this.timers = []
    }

    /**
     * Look at the next timer without removing it.
     * This is the timer the clock would run first if time advanced now.
     * @returns {Timer}
     */
    peek() {
      return this.timers[0]
    }

    /**
     * Add a timer to the waiting room, then move it upward until it is in
     * the right place relative to the timers it should run before and after.
     * @param {Timer} timer
     */
    push(timer) {
      this.timers.push(timer)
      this.bubbleUp(this.timers.length - 1)
    }

    /**
     * Remove and return the next timer to run.
     *
     * We pull the front timer out, move the last timer into the empty spot,
     * and then shift that replacement down until the ordering is correct
     * again. That avoids rebuilding the whole list from scratch.
     * @returns {Timer|undefined}
     */
    pop() {
      if (this.timers.length === 0) {
        return undefined
      }
      const first = this.timers[0]
      const last = this.timers.pop()
      if (this.timers.length > 0) {
        this.timers[0] = last
        last.heapIndex = 0
        this.bubbleDown(0)
      }
      delete first.heapIndex
      return first
    }

    /**
     * Remove a specific timer from the waiting room.
     *
     * The heap stores timers in a shape that lets us jump directly to the
     * timer's current position, replace it with the last timer, and then
     * move that replacement up or down until the ordering is correct again.
     * @param {Timer} timer
     * @returns {boolean}
     */
    remove(timer) {
      const index = timer.heapIndex
      if (index === undefined || this.timers[index] !== timer) {
        return false
      }
      const last = this.timers.pop()
      if (timer !== last) {
        this.timers[index] = last
        last.heapIndex = index
        if (compareTimers(last, timer) < 0) {
          this.bubbleUp(index)
        } else {
          this.bubbleDown(index)
        }
      }
      delete timer.heapIndex
      return true
    }

    /**
     * Move a timer toward the front until it is no longer "earlier" than
     * the timer above it.
     *
     * Conceptually, this is what happens when something newly scheduled
     * turns out to belong ahead of its parent in the waiting room. We keep
     * swapping it upward until it is no longer out of place.
     * @param {number} index
     */
    bubbleUp(index) {
      const timer = this.timers[index]
      let currentIndex = index
      while (currentIndex > 0) {
        const parentIndex = Math.floor((currentIndex - 1) / 2)
        const parent = this.timers[parentIndex]
        if (compareTimers(timer, parent) < 0) {
          this.timers[currentIndex] = parent
          parent.heapIndex = currentIndex
          currentIndex = parentIndex
        } else {
          break
        }
      }
      this.timers[currentIndex] = timer
      timer.heapIndex = currentIndex
    }

    /**
     * Move a timer away from the front until the timer below it is no
     * longer supposed to run after it.
     *
     * This is the opposite of `bubbleUp`: when a timer at the front is
     * removed or moved, the replacement may be too far ahead, so we
     * repeatedly swap it downward with the best child until the waiting
     * room is ordered again.
     * @param {number} index
     */
    bubbleDown(index) {
      const timer = this.timers[index]
      let currentIndex = index
      const halfLength = Math.floor(this.timers.length / 2)
      while (currentIndex < halfLength) {
        const leftIndex = currentIndex * 2 + 1
        const rightIndex = leftIndex + 1
        let bestChildIndex = leftIndex
        let bestChild = this.timers[leftIndex]

        if (
          rightIndex < this.timers.length &&
          compareTimers(this.timers[rightIndex], bestChild) < 0
        ) {
          bestChildIndex = rightIndex
          bestChild = this.timers[rightIndex]
        }

        if (compareTimers(bestChild, timer) < 0) {
          this.timers[currentIndex] = bestChild
          bestChild.heapIndex = currentIndex
          currentIndex = bestChildIndex
        } else {
          break
        }
      }
      this.timers[currentIndex] = timer
      timer.heapIndex = currentIndex
    }
  }

  /**
   * Ensure timer storage and heap stay in sync even if a clear path touches
   * timer state before anything has been scheduled.
   *
   * Why do we need two data structures to keep tabs on timers?
   * 1. Fast ID Lookup (clock.timers): This is a Map from timer IDs to their respective timer objects. It allows clearTimeout(id) and
   * clearInterval(id) to be $O(1)$ operations. Without this map, finding a specific timer in the heap to remove it would require a linear
   * $O(n)$ search, which would significantly degrade performance as the number of active timers grows.
   * 2. Efficient Scheduling (clock.timerHeap): This is a priority queue (min-heap) that keeps timers ordered by their execution time (callAt). It
   * allows the library to instantly find the next timer to run (peek() in $O(1)$) and efficiently update the schedule when timers are added or
   * removed ($O(\log n)$).
   *
   * In short: clock.timers provides fast access by ID, while clock.timerHeap provides fast access by Time. Removing either one would make common
   * operations (like clearing or finding the next timer) much slower.
   * @param {Clock} clock
   */
  function ensureTimerState(clock) {
    if (!clock.timers) {
      clock.timers = new Map()
      clock.timerHeap = new TimerHeap()
    }
  }

  /**
   * @param {Clock} clock
   * @param {number} id
   * @returns {boolean}
   */
  function hasTimer(clock, id) {
    return clock.timers ? clock.timers.has(id) : false
  }

  /**
   * @param {Clock} clock
   * @param {number} id
   * @returns {Timer}
   */
  function getTimer(clock, id) {
    return clock.timers ? clock.timers.get(id) : undefined
  }

  /**
   * @param {Clock} clock
   * @param {Timer} timer
   */
  function setTimer(clock, timer) {
    ensureTimerState(clock)
    clock.timers.set(timer.id, timer)
  }

  /**
   * @param {Clock} clock
   * @param {number} id
   * @returns {boolean}
   */
  function deleteTimer(clock, id) {
    return clock.timers ? clock.timers.delete(id) : false
  }

  /**
   * @param {Clock} clock
   * @param {(timer: Timer) => void} callback
   */
  function forEachActiveTimer(clock, callback) {
    if (!clock.timers) {
      return
    }

    for (const timer of clock.timers.values()) {
      callback(timer)
    }
  }

  /**
   * @param {Clock} clock
   */
  function rebuildTimerHeap(clock) {
    clock.timerHeap = new TimerHeap()
    forEachActiveTimer(clock, (timer) => {
      clock.timerHeap.push(timer)
    })
  }

  /**
   * @param {Clock} clock
   * @param {TimerInitialProps} timer
   * @returns {TimerId} id of the created timer
   */
  function addTimer(clock, timer) {
    if (timer.func === undefined) {
      throw new Error('Callback must be provided to timer calls')
    }

    if (typeof timer.func !== 'function') {
      throw new TypeError(
        `[ERR_INVALID_CALLBACK]: Callback must be a function. Received ${
          timer.func
        } of type ${typeof timer.func}`
      )
    }

    if (clock.isNearInfiniteLimit) {
      timer.error = new Error()
    }

    timer.type = timer.immediate ? 'Immediate' : 'Timeout'

    if (Object.prototype.hasOwnProperty.call(timer, 'delay')) {
      if (typeof timer.delay !== 'number') {
        timer.delay = parseInt(timer.delay, 10)
      }

      if (!isNumberFinite(timer.delay)) {
        timer.delay = 0
      }
      timer.delay = timer.delay > maxTimeout ? 1 : timer.delay
      timer.delay = Math.max(0, timer.delay)
    }

    if (Object.prototype.hasOwnProperty.call(timer, 'interval')) {
      timer.type = 'Interval'
      timer.interval = timer.interval > maxTimeout ? 1 : timer.interval
    }

    if (Object.prototype.hasOwnProperty.call(timer, 'animation')) {
      timer.type = 'AnimationFrame'
      timer.animation = true
    }

    if (Object.prototype.hasOwnProperty.call(timer, 'requestIdleCallback')) {
      // mark timer as IdleCallback type if it has no delay, otherwise it'd be of type timeout
      // this way we are able to sort such that the timer only gets called when there's truly no pending task to run
      if (!timer.delay) {
        timer.type = 'IdleCallback'
      }
      timer.requestIdleCallback = true
    }

    ensureTimerState(clock)

    while (hasTimer(clock, uniqueTimerId)) {
      uniqueTimerId++
      if (uniqueTimerId >= Number.MAX_SAFE_INTEGER) {
        uniqueTimerId = idCounterStart
      }
    }

    timer.id = uniqueTimerId++
    if (uniqueTimerId >= Number.MAX_SAFE_INTEGER) {
      uniqueTimerId = idCounterStart
    }

    timer.order = uniqueTimerOrder++
    timer.createdAt = clock.now
    timer.callAt =
      clock.now + (parseInt(String(timer.delay)) || (clock.duringTick ? 1 : 0))

    setTimer(clock, timer)
    clock.timerHeap.push(timer)

    if (addTimerReturnsObject) {
      const res = {
        refed: true,
        ref: function () {
          this.refed = true
          return this
        },
        unref: function () {
          this.refed = false
          return this
        },
        hasRef: function () {
          return this.refed
        },
        refresh: function () {
          timer.callAt =
            clock.now +
            (parseInt(String(timer.delay)) || (clock.duringTick ? 1 : 0))

          clock.timerHeap.remove(timer)
          timer.order = uniqueTimerOrder++
          setTimer(clock, timer)
          clock.timerHeap.push(timer)

          return this
        },
        [Symbol.toPrimitive]: function () {
          return timer.id
        },
      }
      return res
    }

    return timer.id
  }

  /**
   * Timer comparator
   * @param {Timer} a
   * @param {Timer} b
   * @returns {number}
   */
  function compareTimers(a, b) {
    // Sort IdleCallback timers to the bottom when scheduled for the same time
    if (a.type === 'IdleCallback' && b.type !== 'IdleCallback') {
      return 1
    }
    if (a.type !== 'IdleCallback' && b.type === 'IdleCallback') {
      return -1
    }

    // Sort first by absolute timing
    if (a.callAt < b.callAt) {
      return -1
    }
    if (a.callAt > b.callAt) {
      return 1
    }

    // Sort next by immediate, immediate timers take precedence
    if (a.immediate && !b.immediate) {
      return -1
    }
    if (!a.immediate && b.immediate) {
      return 1
    }

    if (a.order < b.order) {
      return -1
    }
    if (a.order > b.order) {
      return 1
    }

    // Sort next by creation time, earlier-created timers take precedence
    if (a.createdAt < b.createdAt) {
      return -1
    }
    if (a.createdAt > b.createdAt) {
      return 1
    }

    // Sort next by id, lower-id timers take precedence
    if (a.id < b.id) {
      return -1
    }
    if (a.id > b.id) {
      return 1
    }

    // As timer ids are unique, no fallback `0` is necessary
    return 0
  }

  /**
   * @param {Clock} clock
   * @param {number} from
   * @param {number} to
   * @returns {Timer}
   */
  function firstTimerInRange(clock, from, to) {
    if (!clock.timerHeap) {
      return null
    }

    const timers = clock.timerHeap.timers
    if (timers.length === 1 && timers[0].requestIdleCallback) {
      return timers[0]
    }

    const first = clock.timerHeap.peek()
    if (first && inRange(from, to, first)) {
      return first
    }

    /**
     * @type {?Timer}
     */
    let timer = null

    for (let i = 0; i < timers.length; i++) {
      if (
        inRange(from, to, timers[i]) &&
        (!timer || compareTimers(timer, timers[i]) === 1)
      ) {
        timer = timers[i]
      }
    }

    return timer
  }

  /**
   * @param {Clock} clock
   * @returns {Timer}
   */
  function firstTimer(clock) {
    if (!clock.timerHeap) {
      return null
    }
    return clock.timerHeap.peek() || null
  }

  /**
   * @param {Clock} clock
   * @returns {Timer}
   */
  function lastTimer(clock) {
    if (!clock.timerHeap) {
      return null
    }
    const timers = clock.timerHeap.timers
    let timer = null

    for (let i = 0; i < timers.length; i++) {
      if (!timer || compareTimers(timer, timers[i]) === -1) {
        timer = timers[i]
      }
    }

    return timer
  }

  /**
   * @param {Clock} clock
   * @param {Timer} timer
   */
  function callTimer(clock, timer) {
    if (typeof timer.interval === 'number') {
      clock.timerHeap.remove(timer)
      timer.callAt += timer.interval
      timer.order = uniqueTimerOrder++
      if (clock.isNearInfiniteLimit) {
        timer.error = new Error()
      }
      clock.timerHeap.push(timer)
    } else {
      deleteTimer(clock, timer.id)
      clock.timerHeap.remove(timer)
    }

    if (typeof timer.func === 'function') {
      timer.func.apply(null, timer.args)
    }
  }

  /**
   * Gets clear handler name for a given timer type
   * @param {string} ttype
   * @returns {string}
   */
  function getClearHandler(ttype) {
    if (ttype === 'IdleCallback' || ttype === 'AnimationFrame') {
      return `cancel${ttype}`
    }
    return `clear${ttype}`
  }

  /**
   * Gets schedule handler name for a given timer type
   * @param {string} ttype
   * @returns {string}
   */
  function getScheduleHandler(ttype) {
    if (ttype === 'IdleCallback' || ttype === 'AnimationFrame') {
      return `request${ttype}`
    }
    return `set${ttype}`
  }

  /**
   * Creates an anonymous function to warn only once
   * @returns {(msg: string) => void}
   */
  function createWarnOnce() {
    let calls = 0
    return function (msg) {
      !calls++ && console.warn(msg)
    }
  }
  const warnOnce = createWarnOnce()

  /**
   * @param {Clock} clock
   * @param {TimerId} timerId
   * @param {string} ttype
   * @returns {void}
   */
  function clearTimer(clock, timerId, ttype) {
    if (!timerId) {
      // null appears to be allowed in most browsers, and appears to be
      // relied upon by some libraries, like Bootstrap carousel
      return
    }

    // in Node, the ID is stored as the primitive value for `Timeout` objects
    // for `Immediate` objects, no ID exists, so it gets coerced to NaN
    const id = Number(timerId)

    if (Number.isNaN(id) || id < idCounterStart) {
      const handlerName = getClearHandler(ttype)

      if (clock.shouldClearNativeTimers === true) {
        const nativeHandler = clock[`_${handlerName}`]
        return typeof nativeHandler === 'function'
          ? nativeHandler(timerId)
          : undefined
      }

      // Include the stacktrace, excluding the 'error' line
      const stackTrace = new Error().stack.split('\n').slice(1).join('\n')

      warnOnce(
        `FakeTimers: ${handlerName} was invoked to clear a native timer instead of one created by this library.` +
          '\nTo automatically clean-up native timers, use `shouldClearNativeTimers`.' +
          `\n${stackTrace}`
      )
    }

    if (hasTimer(clock, id)) {
      // check that the ID matches a timer of the correct type
      const timer = getTimer(clock, id)
      if (
        timer.type === ttype ||
        (timer.type === 'Timeout' && ttype === 'Interval') ||
        (timer.type === 'Interval' && ttype === 'Timeout')
      ) {
        deleteTimer(clock, id)
        clock.timerHeap.remove(timer)
      } else {
        const clear = getClearHandler(ttype)
        const schedule = getScheduleHandler(timer.type)
        throw new Error(
          `Cannot clear timer: timer created with ${schedule}() but cleared with ${clear}()`
        )
      }
    }
  }

  /**
   * @param {object} target the target containing the method to replace
   * @param {string} method the keyname of the method on the target
   * @param {Clock} clock
   */
  function hijackMethod(target, method, clock) {
    clock[method].hasOwnProperty = Object.prototype.hasOwnProperty.call(
      target,
      method
    )
    clock[`_${method}`] = target[method]

    if (method === 'Date') {
      target[method] = clock[method]
    } else if (method === 'Intl') {
      target[method] = clock[method]
    } else if (method === 'Temporal') {
      target[method] = clock[method]
    } else if (method === 'performance') {
      const originalPerfDescriptor = Object.getOwnPropertyDescriptor(
        target,
        method
      )
      // JSDOM has a read only performance field so we have to save/copy it differently
      if (
        originalPerfDescriptor &&
        originalPerfDescriptor.get &&
        !originalPerfDescriptor.set
      ) {
        Object.defineProperty(clock, `_${method}`, originalPerfDescriptor)

        const perfDescriptor = Object.getOwnPropertyDescriptor(clock, method)
        Object.defineProperty(target, method, perfDescriptor)
      } else {
        target[method] = clock[method]
      }
    } else {
      target[method] = function () {
        return clock[method].apply(clock, arguments)
      }

      Object.defineProperties(
        target[method],
        Object.getOwnPropertyDescriptors(clock[method])
      )
    }

    target[method].clock = clock
  }

  /**
   * @param {Clock} clock
   * @param {number} advanceTimeDelta
   */
  function doIntervalTick(clock, advanceTimeDelta) {
    clock.tick(advanceTimeDelta)
  }

  /** @type {Timers} */
  const timers = {
    setTimeout: _global.setTimeout,
    clearTimeout: _global.clearTimeout,
    setInterval: _global.setInterval,
    clearInterval: _global.clearInterval,
    Date: _global.Date,
  }

  if (isPresent.setImmediate) {
    timers.setImmediate = _global.setImmediate
  }

  if (isPresent.clearImmediate) {
    timers.clearImmediate = _global.clearImmediate
  }

  if (isPresent.hrtime) {
    timers.hrtime = _global.process.hrtime
  }

  if (isPresent.nextTick) {
    timers.nextTick = _global.process.nextTick
  }

  if (isPresent.performance) {
    timers.performance = _global.performance
  }

  if (isPresent.requestAnimationFrame) {
    timers.requestAnimationFrame = _global.requestAnimationFrame
  }

  if (isPresent.queueMicrotask) {
    timers.queueMicrotask = _global.queueMicrotask
  }

  if (isPresent.cancelAnimationFrame) {
    timers.cancelAnimationFrame = _global.cancelAnimationFrame
  }

  if (isPresent.requestIdleCallback) {
    timers.requestIdleCallback = _global.requestIdleCallback
  }

  if (isPresent.cancelIdleCallback) {
    timers.cancelIdleCallback = _global.cancelIdleCallback
  }

  if (isPresent.Intl) {
    timers.Intl = NativeIntl
  }

  if (isPresent.Temporal) {
    timers.Temporal = NativeTemporal
  }

  const originalSetTimeout = _global.setImmediate || _global.setTimeout
  const originalClearInterval = _global.clearInterval
  const originalSetInterval = _global.setInterval

  /**
   * @param {Date|number|TemporalTimelike} [start] the system time - non-integer values are floored
   * @param {number} [loopLimit] maximum number of timers that will be run when calling runAll()
   * @returns {Clock}
   */
  function createClock(start, loopLimit) {
    /** @type {number} */
    start = Math.floor(getEpoch(start))
    const startTimestamp = start
    loopLimit = loopLimit || 1000
    /** @type {number} */
    let nanos = 0
    let uninstalled = false
    /** @type {number[]} */
    const adjustedSystemTime = [0, 0] // [millis, nanoremainder]

    /** @type {Clock} */
    const clock = /** @type {Clock} */ ({
      now: start,
      Date: createDate(),
      loopLimit: loopLimit,
      isNearInfiniteLimit: false,
      tickMode: { mode: 'manual', counter: 0, delta: undefined },
    })

    clock.Date.clock = clock

    function getTimeToNextFrame() {
      return 16 - ((clock.now - startTimestamp) % 16)
    }

    function hrtime(prev) {
      const millisSinceStart =
        clock.now - adjustedSystemTime[0] - startTimestamp
      const secsSinceStart = Math.floor(millisSinceStart / 1000)
      const remainderInNanos =
        (millisSinceStart - secsSinceStart * 1e3) * 1e6 +
        nanos -
        adjustedSystemTime[1]

      if (Array.isArray(prev)) {
        if (prev[1] > 1e9) {
          throw new TypeError("Number of nanoseconds can't exceed a billion")
        }

        const oldSecs = prev[0]
        let nanoDiff = remainderInNanos - prev[1]
        let secDiff = secsSinceStart - oldSecs

        if (nanoDiff < 0) {
          nanoDiff += 1e9
          secDiff -= 1
        }

        return [secDiff, nanoDiff]
      }
      return [secsSinceStart, remainderInNanos]
    }

    /**
     * A high resolution timestamp in milliseconds.
     * @typedef {number} DOMHighResTimeStamp
     */

    /**
     * performance.now()
     * @returns {DOMHighResTimeStamp}
     */
    function fakePerformanceNow() {
      const hrt = hrtime()
      const millis = hrt[0] * 1000 + hrt[1] / 1e6
      return millis
    }

    if (isPresent.hrtimeBigint) {
      hrtime.bigint = function () {
        const parts = hrtime()
        return BigInt(parts[0]) * BigInt(1e9) + BigInt(parts[1])
      }
    }

    if (isPresent.Intl) {
      clock.Intl = createIntl(clock)
      clock.Intl.clock = clock
    }

    if (isPresent.Temporal) {
      clock.Temporal = createTemporal(clock, () => nanos)
    }

    /**
     * @param {SetTickModeConfig} tickModeConfig - The new configuration for how the clock should tick.
     */
    clock.setTickMode = function (tickModeConfig) {
      const { mode: newMode, delta: newDelta } =
        /** @type {SetTickModeConfig} */ (tickModeConfig)
      const { mode: oldMode, delta: oldDelta } = clock.tickMode
      if (newMode === oldMode && newDelta === oldDelta) {
        return
      }

      if (oldMode === 'interval') {
        originalClearInterval(clock.attachedInterval)
      }

      clock.tickMode = {
        counter: clock.tickMode.counter + 1,
        mode: newMode,
        delta: newDelta,
      }

      if (newMode === 'nextAsync') {
        advanceUntilModeChanges()
      } else if (newMode === 'interval') {
        createIntervalTick(clock, newDelta || 20)
      }
    }

    /**
     * Keeps advancing the native event loop until the tick mode changes.
     * @returns {Promise<void>}
     */
    async function advanceUntilModeChanges() {
      /**
       * Waits for one native macrotask and then one microtask turn.
       * @returns {Promise<void>}
       */
      async function newMacrotask() {
        // MessageChannel ensures that setTimeout is not throttled to 4ms.
        // https://developer.mozilla.org/en-US/docs/Web/API/setTimeout#reasons_for_delays_longer_than_specified
        // https://stackblitz.com/edit/stackblitz-starters-qtlpcc
        const channel = new MessageChannel()
        await new Promise((resolve) => {
          channel.port1.onmessage = () => {
            resolve(undefined)
            channel.port1.close()
          }
          channel.port2.postMessage(undefined)
        })
        channel.port1.close()
        channel.port2.close()
        // setTimeout ensures microtask queue is emptied
        await new Promise((resolve) => {
          originalSetTimeout(resolve)
        })
      }

      const { counter } = clock.tickMode
      while (clock.tickMode.counter === counter) {
        await newMacrotask()
        if (clock.tickMode.counter !== counter) {
          return
        }
        clock.next()
      }
    }

    /**
     * Temporarily pauses nextAsync auto-ticking while an async operation runs.
     * @param {Promise<unknown>} promise
     * @returns {Promise<unknown>}
     */
    function pauseAutoTickUntilFinished(promise) {
      if (clock.tickMode.mode !== 'nextAsync') {
        return promise
      }
      clock.setTickMode({ mode: 'manual' })
      return promise.finally(() => {
        if (!uninstalled) {
          clock.setTickMode({ mode: 'nextAsync' })
        }
      })
    }

    /**
     * Returns the remaining time in the current idle window.
     * @returns {number}
     */
    function getTimeToNextIdlePeriod() {
      let timeToNextIdlePeriod = 0

      if (clock.countTimers() > 0) {
        timeToNextIdlePeriod = 50 // const for now
      }

      return timeToNextIdlePeriod
    }

    clock.requestIdleCallback = function requestIdleCallback(
      func,
      { timeout } = /** @type {{ timeout?: number }} */ ({})
    ) {
      /**
       * @type {IdleDeadline}
       */
      const idleDeadline = {
        didTimeout: true,
        timeRemaining: getTimeToNextIdlePeriod,
      }

      const result = addTimer(clock, {
        func: func,
        args: [idleDeadline],
        delay: timeout,
        requestIdleCallback: true,
      })

      return Number(result)
    }

    clock.cancelIdleCallback = function cancelIdleCallback(timerId) {
      return clearTimer(clock, timerId, 'IdleCallback')
    }

    clock.setTimeout = function setTimeout(func, timeout) {
      return addTimer(clock, {
        func: func,
        args: Array.prototype.slice.call(arguments, 2),
        delay: timeout,
      })
    }
    if (typeof _global.Promise !== 'undefined' && utilPromisify) {
      clock.setTimeout[utilPromisify.custom] = function promisifiedSetTimeout(
        timeout,
        arg
      ) {
        return new _global.Promise(function setTimeoutExecutor(resolve) {
          addTimer(clock, {
            func: resolve,
            args: [arg],
            delay: timeout,
          })
        })
      }
    }

    clock.clearTimeout = function clearTimeout(timerId) {
      return clearTimer(clock, timerId, 'Timeout')
    }

    clock.nextTick = function nextTick(func) {
      return enqueueJob(clock, {
        func: func,
        args: Array.prototype.slice.call(arguments, 1),
        error: clock.isNearInfiniteLimit ? new Error() : null,
      })
    }

    clock.queueMicrotask = function queueMicrotask(func) {
      return clock.nextTick(func) // explicitly drop additional arguments
    }

    clock.setInterval = function setInterval(func, timeout) {
      timeout = parseInt(String(timeout), 10)
      return addTimer(clock, {
        func: func,
        args: Array.prototype.slice.call(arguments, 2),
        delay: timeout,
        interval: timeout,
      })
    }

    clock.clearInterval = function clearInterval(timerId) {
      return clearTimer(clock, timerId, 'Interval')
    }

    if (isPresent.setImmediate) {
      clock.setImmediate = /** @type {SetImmediate} */ (
        function setImmediate(func) {
          return addTimer(clock, {
            func: func,
            args: Array.prototype.slice.call(arguments, 1),
            immediate: true,
          })
        }
      )

      if (typeof _global.Promise !== 'undefined' && utilPromisify) {
        clock.setImmediate[utilPromisify.custom] =
          function promisifiedSetImmediate(arg) {
            return new _global.Promise(function setImmediateExecutor(resolve) {
              addTimer(clock, {
                func: resolve,
                args: [arg],
                immediate: true,
              })
            })
          }
      }

      clock.clearImmediate = function clearImmediate(timerId) {
        return clearTimer(clock, timerId, 'Immediate')
      }
    }

    clock.countTimers = function countTimers() {
      return (
        (clock.timerHeap ? clock.timerHeap.timers.length : 0) +
        (clock.jobs || []).length
      )
    }

    clock.requestAnimationFrame = function requestAnimationFrame(func) {
      const result = addTimer(clock, {
        func: func,
        delay: getTimeToNextFrame(),
        get args() {
          return [fakePerformanceNow()]
        },
        animation: true,
      })

      return Number(result)
    }

    clock.cancelAnimationFrame = function cancelAnimationFrame(timerId) {
      return clearTimer(clock, timerId, 'AnimationFrame')
    }

    clock.runMicrotasks = function runMicrotasks() {
      runJobs(clock)
    }

    function durationToMs(duration) {
      // relativeTo uses the real system timezone — fake-timers fakes time, not place.
      // Calendar-unit durations (months, years) will resolve DST/length using the host tz.
      const relativeTo = NativeTemporal.Instant.fromEpochMilliseconds(
        clock.now
      ).toZonedDateTimeISO(NativeTemporal.Now.timeZoneId())
      return duration.total({ unit: 'millisecond', relativeTo })
    }

    /**
     * @param {number|string|TemporalDuration} tickValue
     * @returns {number} milliseconds as a float
     */
    function tickValueToMs(tickValue) {
      if (typeof tickValue === 'number') {
        return tickValue
      }
      if (
        isPresent.Temporal &&
        tickValue !== null &&
        typeof tickValue === 'object' &&
        typeof (/** @type {TemporalDuration} */ (tickValue).total) ===
          'function'
      ) {
        return durationToMs(/** @type {TemporalDuration} */ (tickValue))
      }
      return parseTime(/** @type {string} */ (tickValue))
    }

    /**
     * @param {number|string|TemporalDuration} tickValue milliseconds, a string parseable by parseTime, or a Temporal.Duration
     * @returns {ClockState} a mutable state object for the tick execution
     */
    function createTickState(tickValue) {
      const msFloat = tickValueToMs(tickValue)
      const ms = Math.floor(msFloat)
      const remainder = nanoRemainder(msFloat)
      let nanosTotal = nanos + remainder
      let tickTo = clock.now + ms

      if (msFloat < 0) {
        throw new TypeError('Negative ticks are not supported')
      }

      // adjust for positive overflow
      if (nanosTotal >= 1e6) {
        tickTo += 1
        nanosTotal -= 1e6
      }

      return /** @type {ClockState} */ ({
        msFloat: msFloat,
        ms: ms,
        nanosTotal: nanosTotal,
        tickFrom: clock.now,
        tickTo: tickTo,
        previous: clock.now,
        timer: null,
        firstException: null,
        oldNow: null,
      })
    }

    /**
     * @param {ClockState} state mutable tick state
     * @param {number} oldNow the clock.now before some action
     * @param {object} [options] compensation options
     * @param {boolean} [options.includePrevious] whether to also update state.previous
     */
    function applyClockChangeCompensation(state, oldNow, options) {
      if (oldNow !== clock.now) {
        const difference = clock.now - oldNow
        state.tickFrom += difference
        state.tickTo += difference
        if (options && options.includePrevious) {
          state.previous += difference
        }
      }
    }

    /**
     * @param {ClockState} state mutable tick state
     */
    function runInitialJobs(state) {
      state.oldNow = clock.now
      runJobs(clock)
      applyClockChangeCompensation(state, state.oldNow)
    }

    /**
     * @param {ClockState} state mutable tick state
     */
    function runPostLoopJobs(state) {
      state.oldNow = clock.now
      runJobs(clock)
      applyClockChangeCompensation(state, state.oldNow)
    }

    /**
     * @param {ClockState} state mutable tick state
     */
    function selectNextTimerInRange(state) {
      state.timer = firstTimerInRange(clock, state.previous, state.tickTo)
      state.previous = state.tickFrom
    }

    /**
     * @param {ClockState} state mutable tick state
     * @param {boolean} isAsync whether this is an async tick
     * @param {FakeTimersFunction} nextPromiseTick callback for async promise settlement
     * @param {FakeTimersFunction} compensationCheck callback for clock change compensation
     * @returns {boolean} whether an early return was triggered (async mode)
     */
    function runTimersInRange(
      state,
      isAsync,
      nextPromiseTick,
      compensationCheck
    ) {
      state.timer = firstTimerInRange(clock, state.tickFrom, state.tickTo)

      while (state.timer && state.tickFrom <= state.tickTo) {
        if (hasTimer(clock, state.timer.id)) {
          state.tickFrom = state.timer.callAt
          clock.now = state.timer.callAt
          state.oldNow = clock.now
          try {
            runJobs(clock)
            callTimer(clock, state.timer)
          } catch (e) {
            state.firstException = state.firstException || e
          }

          if (isAsync) {
            // finish up after native setImmediate callback to allow
            // all native es6 promises to process their callbacks after
            // each timer fires.
            originalSetTimeout(nextPromiseTick)
            return true
          }

          compensationCheck()
        }

        selectNextTimerInRange(state)
      }
      return false
    }

    /**
     * @param {ClockState} state mutable tick state
     * @param {boolean} isAsync whether this is an async tick
     * @param {FakeTimersFunction} resolve promise resolve function
     * @returns {number|undefined} the new clock.now or nothing for async
     */
    function finalizeTick(state, isAsync, resolve) {
      // corner case: during runJobs new timers were scheduled which could be in the range [clock.now, tickTo]
      state.timer = firstTimerInRange(clock, state.tickFrom, state.tickTo)
      if (state.timer) {
        try {
          clock.tick(state.tickTo - clock.now) // do it all again - for the remainder of the requested range
        } catch (e) {
          state.firstException = state.firstException || e
        }
      } else {
        // no timers remaining in the requested range: move the clock all the way to the end
        clock.now = state.tickTo

        // update nanos
        nanos = state.nanosTotal
      }
      if (state.firstException) {
        throw state.firstException
      }

      if (isAsync) {
        resolve(clock.now)
      } else {
        return clock.now
      }
    }

    /**
     * @param {number|string|TemporalDuration} tickValue milliseconds or a string parseable by parseTime
     * @param {boolean} isAsync whether this is an async tick
     * @param {FakeTimersFunction} [resolve] promise resolve function
     * @param {FakeTimersFunction} [reject] promise reject function
     * @returns {number|undefined} the new clock.now or nothing for async
     */
    function doTick(tickValue, isAsync, resolve, reject) {
      /** @type {ClockState} */
      const state = createTickState(tickValue)

      nanos = state.nanosTotal
      clock.duringTick = true

      runInitialJobs(state)

      const compensationCheck = function () {
        applyClockChangeCompensation(state, state.oldNow, {
          includePrevious: true,
        })
      }

      const nextPromiseTick =
        isAsync &&
        function () {
          try {
            compensationCheck()
            selectNextTimerInRange(state)
            doTickInner()
          } catch (e) {
            reject(e)
          }
        }

      function doTickInner() {
        if (
          runTimersInRange(state, isAsync, nextPromiseTick, compensationCheck)
        ) {
          return
        }

        runPostLoopJobs(state)
        clock.duringTick = false

        return finalizeTick(state, isAsync, resolve)
      }

      return doTickInner()
    }

    /**
     * @param {string|number|TemporalDuration} tickValue number of milliseconds, a human-readable value like "01:11:15", or a Temporal.Duration
     * @returns {number} will return the new `now` value
     */
    clock.tick = function tick(tickValue) {
      return doTick(tickValue, false)
    }

    clock.next = function next() {
      runJobs(clock)
      const timer = firstTimer(clock)
      if (!timer) {
        return clock.now
      }

      clock.duringTick = true
      try {
        clock.now = timer.callAt
        callTimer(clock, timer)
        runJobs(clock)
        return clock.now
      } finally {
        clock.duringTick = false
      }
    }

    /**
     * @param {(resolve: (value: unknown) => void, reject: (reason?: unknown) => void) => void} callback function to run inside native setTimeout
     * @returns {Promise}
     */
    function runAsyncWithNativeTimeout(callback) {
      return pauseAutoTickUntilFinished(
        new _global.Promise(function (resolve, reject) {
          originalSetTimeout(function () {
            try {
              callback(resolve, reject)
            } catch (e) {
              reject(e)
            }
          })
        })
      )
    }

    clock.runAll = function runAll() {
      runJobs(clock)
      for (let i = 0; i < clock.loopLimit; i++) {
        if (!clock.timers) {
          resetIsNearInfiniteLimit(clock)
          return clock.now
        }

        const numTimers = clock.timerHeap.timers.length
        if (numTimers === 0) {
          resetIsNearInfiniteLimit(clock)
          return clock.now
        }

        checkIsNearInfiniteLimit(clock, i)
        clock.next()
      }

      const excessJob = firstTimer(clock)
      throw getInfiniteLoopError(clock, excessJob)
    }

    clock.runToFrame = function runToFrame() {
      return clock.tick(getTimeToNextFrame())
    }

    clock.runToLast = function runToLast() {
      const timer = lastTimer(clock)
      if (!timer) {
        runJobs(clock)
        return clock.now
      }

      return clock.tick(timer.callAt - clock.now)
    }

    if (typeof _global.Promise !== 'undefined') {
      /**
       * @param {string|number|TemporalDuration} tickValue number of milliseconds, a human-readable value like "01:11:15", or a Temporal.Duration
       * @returns {Promise}
       */
      clock.tickAsync = function tickAsync(tickValue) {
        return runAsyncWithNativeTimeout(function (resolve, reject) {
          doTick(tickValue, true, resolve, reject)
        })
      }

      clock.nextAsync = function nextAsync() {
        return runAsyncWithNativeTimeout(function (resolve, reject) {
          const timer = firstTimer(clock)
          if (!timer) {
            resolve(clock.now)
            return
          }

          let err
          clock.duringTick = true
          clock.now = timer.callAt
          try {
            callTimer(clock, timer)
          } catch (e) {
            err = e
          }
          clock.duringTick = false

          originalSetTimeout(function () {
            if (err) {
              reject(err)
            } else {
              resolve(clock.now)
            }
          })
        })
      }

      clock.runAllAsync = function runAllAsync() {
        let i = 0
        /**
         * @param {(value: unknown) => void} resolve promise resolve function
         * @param {(reason?: unknown) => void} reject promise reject function
         */
        function doRun(resolve, reject) {
          try {
            runJobs(clock)

            let numTimers
            if (i < clock.loopLimit) {
              if (!clock.timerHeap) {
                resetIsNearInfiniteLimit(clock)
                resolve(clock.now)
                return
              }

              numTimers = clock.timerHeap.timers.length
              if (numTimers === 0) {
                resetIsNearInfiniteLimit(clock)
                resolve(clock.now)
                return
              }

              checkIsNearInfiniteLimit(clock, i)
              clock.next()

              i++

              originalSetTimeout(function () {
                doRun(resolve, reject)
              })
              return
            }

            const excessJob = firstTimer(clock)
            reject(getInfiniteLoopError(clock, excessJob))
          } catch (e) {
            reject(e)
          }
        }

        return runAsyncWithNativeTimeout(function (resolve, reject) {
          doRun(resolve, reject)
        })
      }

      clock.runToLastAsync = function runToLastAsync() {
        return runAsyncWithNativeTimeout(function (resolve) {
          const timer = lastTimer(clock)
          if (!timer) {
            runJobs(clock)
            resolve(clock.now)
            return
          }

          resolve(clock.tickAsync(timer.callAt - clock.now))
        })
      }
    }

    clock.reset = function reset() {
      nanos = 0
      clock.timers = new Map()
      clock.timerHeap = new TimerHeap()
      clock.jobs = []
      clock.now = start
    }

    clock.setSystemTime = function setSystemTime(systemTime) {
      // determine time difference
      const newNow = getEpoch(systemTime)
      const difference = newNow - clock.now

      adjustedSystemTime[0] = adjustedSystemTime[0] + difference
      adjustedSystemTime[1] = adjustedSystemTime[1] + nanos
      // update 'system clock'
      clock.now = newNow
      nanos = 0

      // update timers and intervals to keep them stable
      forEachActiveTimer(clock, (timer) => {
        timer.createdAt += difference
        timer.callAt += difference
      })
    }

    /**
     * @param {string|number|TemporalDuration} tickValue number of milliseconds, a human-readable value like "01:11:15", or a Temporal.Duration
     * @returns {number} the new `now` value
     */
    clock.jump = function jump(tickValue) {
      const msFloat = tickValueToMs(tickValue)
      const ms = Math.floor(msFloat)

      forEachActiveTimer(clock, (timer) => {
        if (clock.now + ms > timer.callAt) {
          timer.callAt = clock.now + ms
        }
      })

      // Rebuild heap as order might have changed
      rebuildTimerHeap(clock)

      clock.tick(ms)
      return clock.now
    }

    if (isPresent.performance) {
      clock.performance = Object.create(null)
      clock.performance.now = fakePerformanceNow
    }

    if (isPresent.hrtime) {
      clock.hrtime = hrtime
    }

    /**
     * @returns {Timer[]}
     */
    clock.uninstall = function () {
      uninstalled = true
      clock.setTickMode({ mode: 'manual' })

      if (clock.methods) {
        const installedHrTime = '_hrtime'
        const installedNextTick = '_nextTick'
        let method, i, l
        for (i = 0, l = clock.methods.length; i < l; i++) {
          method = clock.methods[i]
          if (method === 'hrtime' && _global.process) {
            _global.process.hrtime = clock[installedHrTime]
          } else if (method === 'nextTick' && _global.process) {
            _global.process.nextTick = clock[installedNextTick]
          } else if (method === 'performance') {
            const originalPerfDescriptor = Object.getOwnPropertyDescriptor(
              clock,
              `_${method}`
            )
            if (
              originalPerfDescriptor &&
              originalPerfDescriptor.get &&
              !originalPerfDescriptor.set
            ) {
              Object.defineProperty(_global, method, originalPerfDescriptor)
            } else if (originalPerfDescriptor.configurable) {
              _global[method] = clock[`_${method}`]
            }
          } else {
            if (clock[method] && clock[method].hasOwnProperty) {
              _global[method] = clock[`_${method}`]
            } else {
              try {
                delete _global[method]
              } catch {
                // Some host globals cannot be deleted.
              }
            }
          }
          if (clock.timersModuleMethods !== undefined) {
            for (let j = 0; j < clock.timersModuleMethods.length; j++) {
              const entry = clock.timersModuleMethods[j]
              timersModule[entry.methodName] = entry.original
            }
          }
          if (clock.timersPromisesModuleMethods !== undefined) {
            for (let j = 0; j < clock.timersPromisesModuleMethods.length; j++) {
              const entry = clock.timersPromisesModuleMethods[j]
              timersPromisesModule[entry.methodName] = entry.original
            }
          }
        }

        // Prevent multiple executions which will completely remove these props
        clock.methods = []
      }

      if (clock.abortListenerMap) {
        for (const [listener, signal] of clock.abortListenerMap.entries()) {
          signal.removeEventListener('abort', listener)
          clock.abortListenerMap.delete(listener)
        }
      }

      // return pending timers, to enable checking what timers remained on uninstall
      if (!clock.timerHeap) {
        return []
      }
      return clock.timerHeap.timers.slice()
    }

    return clock
  }

  /**
   * Starts the interval used to advance the clock automatically.
   * @param {Clock} clock
   * @param {number} delta
   */
  function createIntervalTick(clock, delta) {
    const intervalTick = doIntervalTick.bind(null, clock, delta)
    const intervalId = originalSetInterval(intervalTick, delta)
    clock.attachedInterval = intervalId
  }

  /**
   * @param {Config=} [config] Optional config
   * @returns {Clock}
   */
  function install(config) {
    if (
      arguments.length > 1 ||
      config instanceof Date ||
      Array.isArray(config) ||
      typeof config === 'number'
    ) {
      throw new TypeError(
        `FakeTimers.install called with ${String(
          config
        )} install requires an object parameter`
      )
    }

    if (_global.Date.isFake === true) {
      // Timers are already faked; this is a problem.
      // Make the user reset timers before continuing.
      throw new TypeError(
        "Can't install fake timers twice on the same global object."
      )
    }

    config = typeof config !== 'undefined' ? config : {}
    config.shouldAdvanceTime = config.shouldAdvanceTime || false
    config.advanceTimeDelta = config.advanceTimeDelta || 20
    config.shouldClearNativeTimers = config.shouldClearNativeTimers || false

    const hasToFake = Object.prototype.hasOwnProperty.call(config, 'toFake')
    const hasToNotFake = Object.prototype.hasOwnProperty.call(
      config,
      'toNotFake'
    )

    if (hasToFake && hasToNotFake) {
      throw new TypeError(
        'config.toFake and config.toNotFake cannot be used together'
      )
    }

    if (config.target) {
      throw new TypeError(
        'config.target is no longer supported. Use `withGlobal(target)` instead.'
      )
    }

    /**
     * Handles a missing timer or API name during installation.
     * @param {string} timer - the name of the missing timer or object
     */
    function handleMissingTimer(timer) {
      if (config.ignoreMissingTimers) {
        return
      }

      throw new ReferenceError(
        `non-existent timers and/or objects cannot be faked: '${timer}'`
      )
    }

    let i, l
    const clock = createClock(config.now, config.loopLimit)
    clock.shouldClearNativeTimers = config.shouldClearNativeTimers

    clock.abortListenerMap = new Map()

    if (hasToFake) {
      clock.methods = /** @type {FakeMethod[]} */ (config.toFake || [])
      if (clock.methods.length === 0) {
        clock.methods = /** @type {FakeMethod[]} */ (Object.keys(timers))
      }
    } else if (hasToNotFake) {
      const methodsToNotFake = /** @type {string[]} */ (config.toNotFake || [])
      clock.methods = /** @type {FakeMethod[]} */ (
        Object.keys(timers).filter(
          (method) => !methodsToNotFake.includes(method)
        )
      )
    } else {
      clock.methods = /** @type {FakeMethod[]} */ (Object.keys(timers))
    }

    if (config.shouldAdvanceTime === true) {
      clock.setTickMode({
        mode: 'interval',
        delta: config.advanceTimeDelta,
      })
    }

    if (clock.methods.includes('performance')) {
      const proto = (() => {
        if (hasPerformanceConstructorPrototype) {
          return _global.performance.constructor.prototype
        }
        if (hasPerformancePrototype) {
          return _global.Performance.prototype
        }
      })()
      if (proto) {
        Object.getOwnPropertyNames(proto).forEach(function (name) {
          if (name !== 'now') {
            clock.performance[name] =
              name.indexOf('getEntries') === 0 ? NOOP_ARRAY : NOOP
          }
        })
        // ensure `mark` returns a value that is valid
        clock.performance.mark = (name) =>
          new FakePerformanceEntry(name, 'mark', 0, 0)
        clock.performance.measure = (name) =>
          new FakePerformanceEntry(name, 'measure', 0, 100)
        // `timeOrigin` should return the time of when the Window session started
        // (or the Worker was installed)
        clock.performance.timeOrigin = getEpoch(config.now)
      } else if ((config.toFake || []).includes('performance')) {
        handleMissingTimer('performance')
      }
    }
    if (_global === globalObject && timersModule) {
      clock.timersModuleMethods = []
    }
    if (_global === globalObject && timersPromisesModule) {
      clock.timersPromisesModuleMethods = []
    }
    for (i = 0, l = clock.methods.length; i < l; i++) {
      const nameOfMethodToReplace = clock.methods[i]

      if (!isPresent[nameOfMethodToReplace]) {
        handleMissingTimer(nameOfMethodToReplace)
        continue
      }

      if (nameOfMethodToReplace === 'hrtime') {
        if (_global.process && typeof _global.process.hrtime === 'function') {
          hijackMethod(_global.process, nameOfMethodToReplace, clock)
        }
      } else if (nameOfMethodToReplace === 'nextTick') {
        if (_global.process && typeof _global.process.nextTick === 'function') {
          hijackMethod(_global.process, nameOfMethodToReplace, clock)
        }
      } else {
        hijackMethod(_global, nameOfMethodToReplace, clock)
      }
      if (
        clock.timersModuleMethods !== undefined &&
        timersModule[nameOfMethodToReplace]
      ) {
        const original = timersModule[nameOfMethodToReplace]
        clock.timersModuleMethods.push({
          methodName: nameOfMethodToReplace,
          original: original,
        })
        timersModule[nameOfMethodToReplace] = _global[nameOfMethodToReplace]
      }
      if (clock.timersPromisesModuleMethods !== undefined) {
        if (nameOfMethodToReplace === 'setTimeout') {
          clock.timersPromisesModuleMethods.push({
            methodName: 'setTimeout',
            original: timersPromisesModule.setTimeout,
          })

          timersPromisesModule.setTimeout = (delay, value, options = {}) =>
            new Promise((resolve, reject) => {
              const abort = () => {
                options.signal.removeEventListener('abort', abort)
                clock.abortListenerMap.delete(abort)

                // This is safe, there is no code path that leads to this function
                // being invoked before handle has been assigned.
                clock.clearTimeout(handle)
                reject(options.signal.reason)
              }

              const handle = clock.setTimeout(() => {
                if (options.signal) {
                  options.signal.removeEventListener('abort', abort)
                  clock.abortListenerMap.delete(abort)
                }

                resolve(value)
              }, delay)

              if (options.signal) {
                if (options.signal.aborted) {
                  abort()
                } else {
                  options.signal.addEventListener('abort', abort)
                  clock.abortListenerMap.set(abort, options.signal)
                }
              }
            })
        } else if (nameOfMethodToReplace === 'setImmediate') {
          clock.timersPromisesModuleMethods.push({
            methodName: 'setImmediate',
            original: timersPromisesModule.setImmediate,
          })

          timersPromisesModule.setImmediate = (value, options = {}) =>
            new Promise((resolve, reject) => {
              const abort = () => {
                options.signal.removeEventListener('abort', abort)
                clock.abortListenerMap.delete(abort)

                // This is safe, there is no code path that leads to this function
                // being invoked before handle has been assigned.
                clock.clearImmediate(handle)
                reject(options.signal.reason)
              }

              const handle = clock.setImmediate(() => {
                if (options.signal) {
                  options.signal.removeEventListener('abort', abort)
                  clock.abortListenerMap.delete(abort)
                }

                resolve(value)
              })

              if (options.signal) {
                if (options.signal.aborted) {
                  abort()
                } else {
                  options.signal.addEventListener('abort', abort)
                  clock.abortListenerMap.set(abort, options.signal)
                }
              }
            })
        } else if (nameOfMethodToReplace === 'setInterval') {
          clock.timersPromisesModuleMethods.push({
            methodName: 'setInterval',
            original: timersPromisesModule.setInterval,
          })

          timersPromisesModule.setInterval = (delay, value, options = {}) => ({
            [Symbol.asyncIterator]: () => {
              const createResolvable = () => {
                let resolve, reject
                const promise =
                  /** @type {Promise<unknown> & { resolve: (value: unknown) => void; reject: (reason: unknown) => void }} */ (
                    new Promise((res, rej) => {
                      resolve = res
                      reject = rej
                    })
                  )
                promise.resolve = resolve
                promise.reject = reject
                return promise
              }

              let done = false
              let hasThrown = false
              let returnCall
              let nextAvailable = 0
              const nextQueue = []

              const handle = clock.setInterval(() => {
                if (nextQueue.length > 0) {
                  nextQueue.shift().resolve()
                } else {
                  nextAvailable++
                }
              }, delay)

              const abort = () => {
                options.signal.removeEventListener('abort', abort)
                clock.abortListenerMap.delete(abort)

                clock.clearInterval(handle)
                done = true
                for (const resolvable of nextQueue) {
                  resolvable.resolve()
                }
              }

              if (options.signal) {
                if (options.signal.aborted) {
                  done = true
                } else {
                  options.signal.addEventListener('abort', abort)
                  clock.abortListenerMap.set(abort, options.signal)
                }
              }

              return {
                next: async () => {
                  if (options.signal?.aborted && !hasThrown) {
                    hasThrown = true
                    throw options.signal.reason
                  }

                  if (done) {
                    return { done: true, value: undefined }
                  }

                  if (nextAvailable > 0) {
                    nextAvailable--
                    return { done: false, value: value }
                  }

                  const resolvable = createResolvable()
                  nextQueue.push(resolvable)

                  await resolvable

                  if (returnCall && nextQueue.length === 0) {
                    returnCall.resolve()
                  }

                  if (options.signal?.aborted && !hasThrown) {
                    hasThrown = true
                    throw options.signal.reason
                  }

                  if (done) {
                    return { done: true, value: undefined }
                  }

                  return { done: false, value: value }
                },
                return: async () => {
                  if (done) {
                    return { done: true, value: undefined }
                  }

                  if (nextQueue.length > 0) {
                    returnCall = createResolvable()
                    await returnCall
                  }

                  clock.clearInterval(handle)
                  done = true

                  if (options.signal) {
                    options.signal.removeEventListener('abort', abort)
                    clock.abortListenerMap.delete(abort)
                  }

                  return { done: true, value: undefined }
                },
              }
            },
          })
        }
      }
    }

    return clock
  }

  return {
    timers: timers,
    createClock: createClock,
    install: install,
    withGlobal(global) {
      return createTimerContext(global, bridge)
    },
  }
}
