import type { PrerenderManifest } from '../../build'

import fs from 'fs'

/**
 * Serializes read-modify-write cycles against the dev prerender manifest.
 *
 * `getStaticPaths` can resolve for several pages at the same time, and every
 * resolution reads the whole manifest, adds its own routes and writes the whole
 * file back. Left unsynchronized, those cycles interleave and corrupt the file:
 * both writes open it with `'w'` and write from offset 0, so a shorter payload
 * finishing last only overwrites a prefix of a longer one and leaves its tail
 * behind, leaving valid JSON followed by garbage. Interleaving also loses
 * updates, because the later cycle read the file before the earlier one wrote
 * it.
 *
 * Writes go through a temporary file and `rename` so a reader can never observe
 * a partially written manifest. That matters in dev specifically:
 * `route-modules/route-module.ts` loads this manifest with
 * `shouldCache: !this.isDev`, so it is re-read and re-parsed on route module
 * loads rather than cached.
 */
export class PrerenderManifestUpdater {
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly manifestPath: string) {}

  /**
   * Applies `mutate` to the current on-disk manifest and persists the result.
   *
   * Cycles run one at a time in call order. The returned promise rejects if
   * this cycle failed, and a failed cycle does not prevent later ones from
   * running.
   */
  public update(mutate: (manifest: PrerenderManifest) => void): Promise<void> {
    const cycle = this.queue.then(() => this.readModifyWrite(mutate))

    // Keep the queue usable when a cycle fails, while still surfacing the
    // failure to the caller.
    this.queue = cycle.catch(() => {})

    return cycle
  }

  private async readModifyWrite(
    mutate: (manifest: PrerenderManifest) => void
  ): Promise<void> {
    const raw = await fs.promises.readFile(this.manifestPath, 'utf8')
    const manifest: PrerenderManifest = JSON.parse(raw)

    mutate(manifest)

    const updated = JSON.stringify(manifest)
    if (updated === raw) return

    const tmpPath = `${this.manifestPath}.${process.pid}.tmp`

    try {
      await fs.promises.writeFile(tmpPath, updated)
      await fs.promises.rename(tmpPath, this.manifestPath)
    } catch (err) {
      await fs.promises.unlink(tmpPath).catch(() => {})
      throw err
    }
  }
}
