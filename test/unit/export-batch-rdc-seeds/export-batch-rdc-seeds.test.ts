/* eslint-env jest */
import {
  getExportPathPageKey,
  getRenderResumeDataCachesForBatch,
} from 'next/dist/export/render-resume-data-cache-batches'

type Entry = { page: string; path: string }

const entry = (page: string, path: string = page): Entry => ({ page, path })

describe('getExportPathPageKey', () => {
  it('uses the path when it matches the page', () => {
    expect(getExportPathPageKey(entry('/[lang]/[slug]'))).toBe('/[lang]/[slug]')
  })

  it('combines page and path when they differ', () => {
    expect(getExportPathPageKey(entry('/[lang]/[slug]', '/en/[slug]'))).toBe(
      '/[lang]/[slug]: /en/[slug]'
    )
  })
})

describe('getRenderResumeDataCachesForBatch', () => {
  const seeds: Record<string, string> = {
    '/[lang]/[slug]': 'seed-root',
    '/[lang]/[slug]: /en/[slug]': 'seed-en',
    '/[lang]/[slug]: /de/[slug]': 'seed-de',
    '/blog/[id]': 'seed-blog',
  }

  it('passes undefined through (initial phase)', () => {
    expect(
      getRenderResumeDataCachesForBatch(undefined, [entry('/a')])
    ).toBeUndefined()
  })

  it('only includes the seeds for paths in the batch', () => {
    expect(
      getRenderResumeDataCachesForBatch(seeds, [
        entry('/[lang]/[slug]'),
        entry('/[lang]/[slug]', '/de/[slug]'),
      ])
    ).toEqual({
      '/[lang]/[slug]': 'seed-root',
      '/[lang]/[slug]: /de/[slug]': 'seed-de',
    })
  })

  it('returns an empty map when no path in the batch has a seed', () => {
    expect(
      getRenderResumeDataCachesForBatch(seeds, [
        entry('/[lang]/[slug]', '/fr/[slug]'),
        entry('/other/[id]'),
      ])
    ).toEqual({})
  })

  it('does not match a page key by page alone', () => {
    // `/[lang]/[slug]` as a page with a different path must not pick up the
    // seed stored under the bare `/[lang]/[slug]` key.
    expect(
      getRenderResumeDataCachesForBatch(seeds, [
        entry('/[lang]/[slug]', '/it/[slug]'),
      ])
    ).toEqual({})
  })

  it('partitions the map across batches without dropping or duplicating seeds', () => {
    const batches: Entry[][] = [
      [entry('/[lang]/[slug]'), entry('/[lang]/[slug]', '/fr/[slug]')],
      [entry('/[lang]/[slug]', '/en/[slug]'), entry('/blog/[id]')],
      [entry('/[lang]/[slug]', '/de/[slug]')],
    ]

    const perBatch = batches.map(
      (batch) => getRenderResumeDataCachesForBatch(seeds, batch)!
    )

    const keys = perBatch.flatMap((batchSeeds) => Object.keys(batchSeeds))
    expect(keys.sort()).toEqual(Object.keys(seeds).sort())
    expect(new Set(keys).size).toBe(keys.length)
    expect(Object.assign({}, ...perBatch)).toEqual(seeds)
  })

  it('does not mutate the input map', () => {
    const copy = { ...seeds }
    getRenderResumeDataCachesForBatch(seeds, [entry('/blog/[id]')])
    expect(seeds).toEqual(copy)
  })
})
