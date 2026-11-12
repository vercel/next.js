/** @jest-environment jsdom */

import { TurbopackHmr } from 'next/dist/client/dev/hot-reloader/turbopack-hot-reloader-common'

describe('Turbopack HMR latency', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 1000 })
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('reports an update once across repeated build completions', () => {
    const hmr = new TurbopackHmr()
    hmr.onBuilding()
    jest.advanceTimersByTime(43)
    hmr.onServerComponentChanges()

    expect(hmr.onBuilt()).toMatchObject({
      hasUpdates: true,
      startMsSinceEpoch: 1000,
      endMsSinceEpoch: 1043,
    })
    expect(hmr.onBuilt()).toBeNull()
    expect(hmr.onBuilt()).toBeNull()
  })

  it('still reports a fresh update after a build completion', () => {
    const hmr = new TurbopackHmr()
    hmr.onBuilding()
    hmr.onServerComponentChanges()
    expect(hmr.onBuilt()?.hasUpdates).toBe(true)

    jest.advanceTimersByTime(20)
    hmr.onServerComponentChanges()
    expect(hmr.onBuilt()).toMatchObject({
      hasUpdates: true,
      startMsSinceEpoch: 1000,
      endMsSinceEpoch: 1020,
    })
    expect(hmr.onBuilt()).toBeNull()

    jest.advanceTimersByTime(10)
    hmr.onBuilding()
    jest.advanceTimersByTime(30)
    hmr.onServerComponentChanges()
    expect(hmr.onBuilt()).toMatchObject({
      hasUpdates: true,
      startMsSinceEpoch: 1030,
      endMsSinceEpoch: 1060,
    })
    expect(hmr.onBuilt()).toBeNull()
  })
})
