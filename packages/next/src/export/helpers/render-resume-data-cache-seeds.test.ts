import type { ExportPagesResult, ExportPathEntry } from '../types'
import {
  buildRDCCacheByPage,
  selectRDCSeeds,
} from './render-resume-data-cache-seeds'

const page = '/[lang]/blog/[slug]'

function prerendered(path: string): ExportPathEntry {
  return { page, path }
}

function fallbackShell(path: string, paramNames: string[]): ExportPathEntry {
  return {
    page,
    path,
    _allowEmptyStaticShell: true,
    _fallbackRouteParams: paramNames.map((paramName) => ({
      paramName,
      paramType: 'dynamic',
    })),
  }
}

function result(path: string, renderResumeDataCache?: string) {
  return {
    page,
    path,
    pageKey: `${page}: ${path}`,
    result: {
      cacheControl: { revalidate: false, expire: undefined },
      duration: 0,
      renderResumeDataCache,
    },
  } satisfies ExportPagesResult[number]
}

describe('selectRDCSeeds', () => {
  it('picks the first prerendered path with the known params of each fallback shell', () => {
    const initial = [
      prerendered('/en/blog/a'),
      prerendered('/fr/blog/b'),
      prerendered('/en/blog/c'),
    ]
    const final = [
      fallbackShell('/en/blog/[slug]', ['slug']),
      fallbackShell('/fr/blog/[slug]', ['slug']),
      fallbackShell('/[lang]/blog/[slug]', ['lang', 'slug']),
    ]

    const seeds = selectRDCSeeds(initial, final)

    expect(Object.fromEntries(seeds)).toEqual({
      [`${page}: /en/blog/[slug]`]: `${page}: /en/blog/a`,
      [`${page}: /fr/blog/[slug]`]: `${page}: /fr/blog/b`,
      [page]: `${page}: /en/blog/a`,
    })
    expect(initial.map((exportPath) => exportPath._isRDCSeed)).toEqual([
      true,
      true,
      undefined,
    ])
  })

  it('marks no path when there are no fallback shells', () => {
    const initial = [prerendered('/en/blog/a'), prerendered('/fr/blog/b')]

    expect(selectRDCSeeds(initial, []).size).toBe(0)
    expect(initial.some((exportPath) => exportPath._isRDCSeed)).toBe(false)
  })

  it('skips a fallback shell without a prerendered path of its known params', () => {
    const initial = [prerendered('/en/blog/a')]

    const seeds = selectRDCSeeds(initial, [
      fallbackShell('/de/blog/[slug]', ['slug']),
    ])

    expect(seeds.size).toBe(0)
    expect(initial[0]._isRDCSeed).toBeUndefined()
  })
})

describe('buildRDCCacheByPage', () => {
  it('maps each fallback shell to the RDC of its seed', () => {
    const results = [
      result('/en/blog/a', 'rdc-en'),
      result('/fr/blog/b', 'rdc-fr'),
      result('/en/blog/c'),
    ]
    const seeds = new Map([
      [`${page}: /en/blog/[slug]`, `${page}: /en/blog/a`],
      [`${page}: /fr/blog/[slug]`, `${page}: /fr/blog/b`],
      [page, `${page}: /en/blog/a`],
    ])

    expect(buildRDCCacheByPage(results, seeds)).toEqual({
      [`${page}: /en/blog/[slug]`]: 'rdc-en',
      [`${page}: /fr/blog/[slug]`]: 'rdc-fr',
      [page]: 'rdc-en',
    })
    expect(
      results.map(
        ({ result: { renderResumeDataCache } }) => renderResumeDataCache
      )
    ).toEqual([undefined, undefined, undefined])
  })
})
