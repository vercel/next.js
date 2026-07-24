/* eslint-env jest */
import Watchpack from 'next/dist/compiled/watchpack'
import {
  hasPendingInitialScan,
  waitForInitialScan,
} from 'next/dist/server/lib/router-utils/watchpack-initial-scan'
import fs from 'fs'
import os from 'os'
import path from 'path'

const FILES_PER_DIR = 40
const DIR_COUNT = 50

describe('watchpack-initial-scan', () => {
  let dir: string
  let expectedFiles: string[]
  let wp: Watchpack | undefined

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchpack-initial-scan-'))
    expectedFiles = []
    for (let d = 0; d < DIR_COUNT; d++) {
      const nested = path.join(dir, `dir-${d}`, 'nested')
      fs.mkdirSync(nested, { recursive: true })
      for (let f = 0; f < FILES_PER_DIR; f++) {
        const file = path.join(nested, `file-${f}.js`)
        fs.writeFileSync(file, `// ${d}/${f}`)
        expectedFiles.push(file)
      }
    }
  })

  afterEach(() => {
    wp?.close()
    wp = undefined
  })

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('reports a pending scan right after watch() and completes with the full tree', async () => {
    wp = new Watchpack({ aggregateTimeout: 5 })
    wp.watch({ directories: [dir], startTime: 0 })

    // The scan is asynchronous (watchpack defers it with process.nextTick),
    // so nothing has been scanned yet at this point.
    expect(hasPendingInitialScan(wp)).toBe(true)

    await waitForInitialScan(wp)

    expect(hasPendingInitialScan(wp)).toBe(false)
    const known = wp.getTimeInfoEntries()
    for (const file of expectedFiles) {
      expect(known.has(file)).toBe(true)
    }
  })

  it('sees the complete tree even when aggregated fires mid-scan', async () => {
    // With an aggregateTimeout of 0 the aggregated event fires on the first
    // event-loop lull of the scan, which for a tree of this size is reliably
    // before the scan has finished — the situation a loaded machine produces
    // with the production 5ms timeout.
    wp = new Watchpack({ aggregateTimeout: 0 })
    wp.watch({ directories: [dir], startTime: 0 })

    await new Promise<void>((resolve) => wp!.once('aggregated', resolve))

    await waitForInitialScan(wp)

    const known = wp.getTimeInfoEntries()
    for (const file of expectedFiles) {
      expect(known.has(file)).toBe(true)
    }
  })
})
