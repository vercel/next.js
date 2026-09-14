// The CI gate reads `isCI` from this module at construction time; force it off
// so the bar is enabled for the "enabled" tests below.
jest.mock('../server/ci-info', () => ({ isCI: false }))

import { createBuildProgressBar } from './progress-bar'

const ESC = '\x1b'
const BEL = '\x07'

/** Parse the `<state>;<pct>` pairs out of captured OSC 9;4 writes. */
function parseOsc(writes: string[]): Array<{ state: number; pct: number }> {
  return writes
    .join('')
    .split(BEL)
    .filter(Boolean)
    .map((seq) => {
      const match = seq.match(/\]9;4;(\d+);(\d+)$/)
      if (!match) {
        throw new Error(`unexpected sequence: ${JSON.stringify(seq)}`)
      }
      return { state: Number(match[1]), pct: Number(match[2]) }
    })
}

describe('createBuildProgressBar', () => {
  let writeSpy: jest.SpyInstance
  let writes: string[]
  const originalIsTTY = process.stdout.isTTY
  const originalDisable = process.env.NEXT_DISABLE_BUILD_PROGRESS

  beforeEach(() => {
    writes = []
    writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: any) => {
        writes.push(String(chunk))
        return true
      })
    ;(process.stdout as any).isTTY = true
    delete process.env.NEXT_DISABLE_BUILD_PROGRESS
  })

  afterEach(() => {
    writeSpy.mockRestore()
    ;(process.stdout as any).isTTY = originalIsTTY
    if (originalDisable === undefined) {
      delete process.env.NEXT_DISABLE_BUILD_PROGRESS
    } else {
      process.env.NEXT_DISABLE_BUILD_PROGRESS = originalDisable
    }
    jest.useRealTimers()
  })

  it('emits well-formed OSC 9;4 sequences with ESC prefix and BEL terminator', () => {
    const bar = createBuildProgressBar()
    bar.startStage('collect-page-data')
    bar.setStageFraction('collect-page-data', 1, 1)

    expect(writes.every((w) => w.startsWith(`${ESC}]9;4;`))).toBe(true)
    expect(writes.every((w) => w.endsWith(BEL))).toBe(true)
  })

  it('maps a counted stage fraction into its band', () => {
    const bar = createBuildProgressBar()
    // collect-page-data band is 74 -> 88, so 50% => 81.
    bar.setStageFraction('collect-page-data', 5, 10)

    const events = parseOsc(writes)
    expect(events.at(-1)).toEqual({ state: 1, pct: 81 })
  })

  it('never moves the bar backwards', () => {
    const bar = createBuildProgressBar()
    bar.setStageFraction('collect-page-data', 8, 10) // ~85
    bar.setStageFraction('collect-page-data', 2, 10) // would be ~77, ignored

    const pcts = parseOsc(writes).map((e) => e.pct)
    for (let i = 1; i < pcts.length; i++) {
      expect(pcts[i]).toBeGreaterThanOrEqual(pcts[i - 1])
    }
  })

  it('snaps to the band end on completeStage', () => {
    const bar = createBuildProgressBar()
    bar.startStage('collect-page-data')
    bar.setStageFraction('collect-page-data', 1, 10)
    bar.completeStage('collect-page-data')

    expect(parseOsc(writes).at(-1)).toEqual({ state: 1, pct: 88 })
  })

  it('eases toward the band end without reaching it, then snaps on completion', () => {
    jest.useFakeTimers()
    const bar = createBuildProgressBar()
    bar.startStage('compile') // band 3 -> 62, easing

    jest.advanceTimersByTime(250 * 20)
    const beforeComplete = parseOsc(writes).at(-1)!
    expect(beforeComplete.pct).toBeGreaterThan(3)
    expect(beforeComplete.pct).toBeLessThan(62)

    bar.completeStage('compile')
    expect(parseOsc(writes).at(-1)).toEqual({ state: 1, pct: 62 })
  })

  it('finish fills to 100 then clears the bar', () => {
    const bar = createBuildProgressBar()
    bar.startStage('finalize')
    bar.finish()

    const events = parseOsc(writes)
    expect(events.some((e) => e.state === 1 && e.pct === 100)).toBe(true)
    expect(events.at(-1)).toEqual({ state: 0, pct: 0 })
  })

  it('fail emits the error state then clears the bar', () => {
    const bar = createBuildProgressBar()
    bar.startStage('compile')
    bar.setStageFraction('collect-page-data', 1, 2)
    bar.fail()

    const events = parseOsc(writes)
    expect(events.some((e) => e.state === 2)).toBe(true)
    expect(events.at(-1)).toEqual({ state: 0, pct: 0 })
  })

  it('is a no-op when not attached to a TTY', () => {
    ;(process.stdout as any).isTTY = false
    const bar = createBuildProgressBar()
    bar.startStage('compile')
    bar.setStageFraction('collect-page-data', 1, 2)
    bar.completeStage('compile')
    bar.finish()

    expect(writes).toHaveLength(0)
  })

  it('is a no-op when NEXT_DISABLE_BUILD_PROGRESS is set', () => {
    process.env.NEXT_DISABLE_BUILD_PROGRESS = '1'
    const bar = createBuildProgressBar()
    bar.startStage('compile')
    bar.finish()

    expect(writes).toHaveLength(0)
  })
})

describe('createBuildProgressBar in CI', () => {
  it('is a no-op when isCI is true', () => {
    jest.resetModules()
    jest.doMock('../server/ci-info', () => ({ isCI: true }))
    const writes: string[] = []
    const writeSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: any) => {
        writes.push(String(chunk))
        return true
      })
    const originalIsTTY = process.stdout.isTTY
    ;(process.stdout as any).isTTY = true

    try {
      const { createBuildProgressBar: create } =
        require('./progress-bar') as typeof import('./progress-bar')
      const bar = create()
      bar.startStage('compile')
      bar.finish()
      expect(writes).toHaveLength(0)
    } finally {
      writeSpy.mockRestore()
      ;(process.stdout as any).isTTY = originalIsTTY
      jest.dontMock('../server/ci-info')
      jest.resetModules()
    }
  })
})
