import type { PrerenderManifest, PrerenderManifestRoute } from '../../build'

import fs from 'fs'
import os from 'os'
import { join } from 'path'

import { PrerenderManifestUpdater } from './prerender-manifest-updater'

const createManifest = (): PrerenderManifest => ({
  version: 4,
  routes: {},
  dynamicRoutes: {},
  notFoundRoutes: [],
  preview: {
    previewModeId: 'preview-mode-id',
    previewModeEncryptionKey: 'a'.repeat(64),
    previewModeSigningKey: 'b'.repeat(64),
  },
})

// Matches what the dev server writes for a statically known path.
const emptyRoute = () => ({}) as PrerenderManifestRoute

describe('PrerenderManifestUpdater', () => {
  let distDir: string
  let manifestPath: string
  let updater: PrerenderManifestUpdater

  beforeEach(() => {
    distDir = fs.mkdtempSync(join(os.tmpdir(), 'prerender-manifest-updater-'))
    manifestPath = join(distDir, 'prerender-manifest.json')
    fs.writeFileSync(manifestPath, JSON.stringify(createManifest()))
    updater = new PrerenderManifestUpdater(manifestPath)
  })

  afterEach(() => {
    fs.rmSync(distDir, { recursive: true, force: true })
  })

  const readManifest = (): PrerenderManifest =>
    JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

  it('runs concurrent cycles one at a time, in call order', async () => {
    const cycles = 25
    const observed: number[] = []

    await Promise.all(
      Array.from({ length: cycles }, (_, i) =>
        updater.update((manifest) => {
          // Each cycle reads what the previous one wrote, so the number of
          // routes it observes is its own position in the queue.
          observed.push(Object.keys(manifest.routes).length)
          manifest.routes[`/route-${i}`] = emptyRoute()
        })
      )
    )

    expect(observed).toEqual(Array.from({ length: cycles }, (_, i) => i))

    // No update is lost: every cycle's route survives.
    expect(Object.keys(readManifest().routes)).toHaveLength(cycles)
  })

  it('never exposes a partially written manifest to a reader', async () => {
    // In dev this manifest is re-read on route module loads rather than cached,
    // so a non-atomic write lets a reader land mid-write and parse truncated
    // JSON. A large payload widens that window.
    const routesPerCycle = 500
    const readErrors: unknown[] = []
    const observedRouteCounts: number[] = []

    let reading = true
    const reader = (async () => {
      while (reading) {
        try {
          const manifest: PrerenderManifest = JSON.parse(
            fs.readFileSync(manifestPath, 'utf8')
          )
          observedRouteCounts.push(Object.keys(manifest.routes).length)
        } catch (err) {
          readErrors.push(err)
        }
        await new Promise((resolve) => setImmediate(resolve))
      }
    })()

    await Promise.all(
      Array.from({ length: 10 }, (_, cycle) =>
        updater.update((manifest) => {
          for (let i = 0; i < routesPerCycle; i++) {
            manifest.routes[`/cycle-${cycle}/route-${i}`] = emptyRoute()
          }
        })
      )
    )

    reading = false
    await reader

    expect(readErrors).toEqual([])

    // A reader also never observes a manifest that went backwards, which is
    // what a lost update would look like from the outside.
    expect(observedRouteCounts).toEqual(
      [...observedRouteCounts].sort((a, b) => a - b)
    )
  })

  it('surfaces a failed cycle without poisoning the queue', async () => {
    const failure = new Error('mutate failed')

    await expect(
      updater.update(() => {
        throw failure
      })
    ).rejects.toBe(failure)

    await updater.update((manifest) => {
      manifest.routes['/after-failure'] = emptyRoute()
    })

    expect(Object.keys(readManifest().routes)).toEqual(['/after-failure'])
  })

  it('skips the write when the manifest is unchanged', async () => {
    const writeFile = jest.spyOn(fs.promises, 'writeFile')

    await updater.update(() => {})

    expect(writeFile).not.toHaveBeenCalled()

    writeFile.mockRestore()
  })

  it('removes the temporary file when the write fails', async () => {
    const failure = new Error('rename failed')
    const rename = jest
      .spyOn(fs.promises, 'rename')
      .mockRejectedValue(failure as never)

    await expect(
      updater.update((manifest) => {
        manifest.routes['/route'] = emptyRoute()
      })
    ).rejects.toBe(failure)

    rename.mockRestore()

    expect(fs.readdirSync(distDir)).toEqual(['prerender-manifest.json'])
  })
})
