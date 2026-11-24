/**
 * @jest-environment jsdom
 */
import type { TurbopackMessage } from '../../../server/dev/hot-reloader-types'
import { TurbopackHmr } from './turbopack-hot-reloader-common'

const turbopackMessage = { data: [] } as unknown as TurbopackMessage

describe('TurbopackHmr', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: 1_000 })
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  function applyEdit(hmr: TurbopackHmr, durationMs: number) {
    hmr.onBuilding()
    jest.advanceTimersByTime(durationMs)
    hmr.onTurbopackMessage(turbopackMessage)
    return hmr.onBuilt()
  }

  it('reports an HMR update', () => {
    const hmr = new TurbopackHmr()

    expect(applyEdit(hmr, 30)).toEqual({
      hasUpdates: true,
      updatedModules: new Set(),
      startMsSinceEpoch: 1_000,
      endMsSinceEpoch: 1_030,
    })
  })

  it('does not report the previous update again on a built event without a building event', () => {
    const hmr = new TurbopackHmr()
    applyEdit(hmr, 30)

    // The dev server suppresses `building` for compilations shorter than
    // 100ms (e.g. on navigation), so only `built` reaches the client.
    jest.advanceTimersByTime(50)
    expect(hmr.onBuilt()).toBeNull()
    jest.advanceTimersByTime(50)
    expect(hmr.onBuilt()).toBeNull()
  })

  it('reports the timing of the latest update', () => {
    const hmr = new TurbopackHmr()
    applyEdit(hmr, 30)
    hmr.onBuilt()

    jest.advanceTimersByTime(1_000)

    expect(applyEdit(hmr, 20)).toEqual({
      hasUpdates: true,
      updatedModules: new Set(),
      startMsSinceEpoch: 2_030,
      endMsSinceEpoch: 2_050,
    })
  })
})
