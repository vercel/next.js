/**
 * Copyright (c) Facebook, Inc. and its affiliates. All Rights Reserved.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of https://github.com/jestjs/jest.
 */

import type {
  TimerClock as Clock,
  FakeTimerMethod as FakeMethod,
  FakeTimerConfig as FakeTimersConfig,
  TimerContext as FakeTimersContext,
} from '../../../compiled/next-test-primitives/timers'
import { createTimerContext } from '../../../compiled/next-test-primitives/timers'
const timersModule = require('node:timers') as typeof import('node:timers')
const timersPromisesModule =
  require('node:timers/promises') as typeof import('node:timers/promises')
const utilModule = require('node:util') as typeof import('node:util')

const childProcessRealm = typeof process.send === 'function'
const isChildProcess = () => childProcessRealm

const RealDate = globalThis.Date

export class TestFakeTimers {
  private _global: typeof globalThis
  private _clock!: Clock
  // | _fakingTime | _fakingDate |
  // +-------------+-------------+
  // | false       | falsy       | initial
  // | false       | truthy      | vi.setSystemTime called first (for mocking only Date without fake timers)
  // | true        | falsy       | vi.useFakeTimers called first
  // | true        | truthy      | unreachable
  private _fakingTime: boolean
  private _fakingDate: Date | null
  private _fakeTimers: FakeTimersContext
  private _userConfig?: FakeTimersConfig
  private _now = RealDate.now

  constructor({
    global,
    config,
  }: {
    global: typeof globalThis
    config: FakeTimersConfig
  }) {
    this._userConfig = config

    this._fakingDate = null

    this._fakingTime = false
    this._fakeTimers = createTimerContext(global, {
      timers: timersModule,
      timersPromises: timersPromisesModule,
      util: utilModule,
    })
    this._global = global
  }

  clearAllTimers(): void {
    if (this._fakingTime) {
      this._clock.reset()
    }
  }

  dispose(): void {
    this.useRealTimers()
  }

  runAllTimers(): void {
    if (this._checkFakeTimers()) {
      this._clock.runAll()
    }
  }

  async runAllTimersAsync(): Promise<void> {
    if (this._checkFakeTimers()) {
      await this._clock.runAllAsync()
    }
  }

  runOnlyPendingTimers(): void {
    if (this._checkFakeTimers()) {
      this._clock.runToLast()
    }
  }

  async runOnlyPendingTimersAsync(): Promise<void> {
    if (this._checkFakeTimers()) {
      await this._clock.runToLastAsync()
    }
  }

  advanceTimersToNextTimer(steps = 1): void {
    if (this._checkFakeTimers()) {
      for (let i = steps; i > 0; i--) {
        this._clock.next()
        // Fire all timers at this point: https://github.com/sinonjs/fake-timers/issues/250
        this._clock.tick(0)

        if (this._clock.countTimers() === 0) {
          break
        }
      }
    }
  }

  async advanceTimersToNextTimerAsync(steps = 1): Promise<void> {
    if (this._checkFakeTimers()) {
      for (let i = steps; i > 0; i--) {
        await this._clock.nextAsync()
        // Fire all timers at this point: https://github.com/sinonjs/fake-timers/issues/250
        this._clock.tick(0)

        if (this._clock.countTimers() === 0) {
          break
        }
      }
    }
  }

  advanceTimersByTime(msToRun: number): void {
    if (this._checkFakeTimers()) {
      this._clock.tick(msToRun)
    }
  }

  async advanceTimersByTimeAsync(msToRun: number): Promise<void> {
    if (this._checkFakeTimers()) {
      await this._clock.tickAsync(msToRun)
    }
  }

  advanceTimersToNextFrame(): void {
    if (this._checkFakeTimers()) {
      this._clock.runToFrame()
    }
  }

  runAllTicks(): void {
    if (this._checkFakeTimers()) {
      this._clock.runMicrotasks()
    }
  }

  useRealTimers(): void {
    if (this._fakingDate) {
      this._clock.uninstall()
      this._fakingDate = null
    }

    if (this._fakingTime) {
      this._clock.uninstall()
      this._fakingTime = false
    }
  }

  useFakeTimers(): void {
    const fakeDate = this._fakingDate || Date.now()
    if (this._fakingDate) {
      this._clock.uninstall()
      this._fakingDate = null
    }

    if (this._fakingTime) {
      this._clock.uninstall()
    }

    let toFake = this._userConfig?.toFake
    if (isChildProcess() && toFake?.includes('nextTick')) {
      throw new Error('process.nextTick cannot be mocked inside child_process')
    }

    let toNotFake = this._userConfig?.toNotFake
    if (toFake === undefined && toNotFake === undefined) {
      // Do not mock timers internally used by node by default. It can still be mocked through userConfig.
      toFake = (Object.keys(this._fakeTimers.timers) as FakeMethod[]).filter(
        (timer) => timer !== 'nextTick' && timer !== 'queueMicrotask'
      )
    } else if (toFake === undefined && toNotFake !== undefined) {
      // Do not mock timers internally used by node via `toNotFake`
      for (const timer of ['nextTick', 'queueMicrotask'] as const) {
        if (!toNotFake.includes(timer)) {
          toNotFake = [...toNotFake, timer]
        }
      }
    }
    if (isChildProcess() && toNotFake && !toNotFake.includes('nextTick')) {
      toNotFake = [...toNotFake, 'nextTick']
    }

    this._clock = this._fakeTimers.install({
      now: fakeDate,
      ...this._userConfig,
      ...(toFake && { toFake }),
      ...(toNotFake && { toNotFake }),
      ignoreMissingTimers: true,
    })

    this._fakingTime = true
  }

  reset(): void {
    if (this._checkFakeTimers()) {
      const { now } = this._clock
      this._clock.reset()
      this._clock.setSystemTime(now)
    }
  }

  setSystemTime(now?: string | number | Date): void {
    const date =
      typeof now === 'undefined' || now instanceof Date ? now : new Date(now)
    if (this._fakingTime) {
      this._clock.setSystemTime(date)
    } else {
      const newFakingDate = date ?? new Date(this.getRealSystemTime())
      if (this._fakingDate) {
        this._fakingDate = newFakingDate
        this._clock.setSystemTime(newFakingDate)
      } else {
        this._fakingDate = newFakingDate
        this._clock = this._fakeTimers.install({
          now: newFakingDate,
          toFake: ['Date', 'Temporal'],
          ignoreMissingTimers: true,
        })
      }
    }
  }

  getMockedSystemTime(): Date | null {
    return this._fakingTime ? new Date(this._clock.now) : this._fakingDate
  }

  getRealSystemTime(): number {
    return this._now()
  }

  getTimerCount(): number {
    if (this._checkFakeTimers()) {
      return this._clock.countTimers()
    }

    return 0
  }

  setTimerTickMode(
    mode: 'manual' | 'nextTimerAsync' | 'interval',
    interval?: number
  ): void {
    if (this._checkFakeTimers()) {
      if (mode === 'manual') {
        this._clock.setTickMode({ mode: 'manual' })
      } else if (mode === 'nextTimerAsync') {
        this._clock.setTickMode({ mode: 'nextAsync' })
      } else if (mode === 'interval') {
        this._clock.setTickMode({ mode: 'interval', delta: interval })
      } else {
        throw new Error(`Invalid tick mode: ${mode}`)
      }
    }
  }

  configure(config: FakeTimersConfig): void {
    this._userConfig = config
  }

  isFakeTimers(): boolean {
    return this._fakingTime
  }

  private _checkFakeTimers() {
    if (!this._fakingTime) {
      throw new Error(
        'A function to advance timers was called but the timers APIs are not mocked. ' +
          'Call `vi.useFakeTimers()` in the test file first.'
      )
    }

    return this._fakingTime
  }
}
