import { pageToRoute } from '../utils'
import { collectFallbackShellRuns } from './fallback-shell-runs'
import type { RoutesManifest } from '..'

// The suites in `test/production/app-dir/adapter-dynamic-routes` cover the
// shapes that a build produces, and they pin the entries that come out of them.
// Most cases below cover something those suites cannot: inputs that make this
// function decline. A build does not produce those inputs, and a guard that
// stopped declining would collapse shells that are not safe to collapse, which
// no snapshot would catch.
//
// The first case is a successful collapse, so that the file also shows the
// shape of a result.

/**
 * A fallback shell, which the build derives from a source page.
 */
function shell(page: string, sourcePage: string) {
  return pageToRoute(page, sourcePage)
}

/**
 * Any other dynamic route, which carries no source page.
 */
function plain(page: string) {
  return pageToRoute(page, undefined)
}

function collect(
  routes: ReturnType<typeof plain>[],
  fallbackFalsePages: string[] = []
) {
  const result = collectFallbackShellRuns(
    routes as RoutesManifest['dynamicRoutes'],
    (page) => fallbackFalsePages.includes(page)
  )

  return {
    runs: Object.fromEntries(result.byRepresentativePage),
    replaced: [...result.replacedPages],
  }
}

describe('collectFallbackShellRuns', () => {
  it('collapses a run of shells that share a source page', () => {
    expect(
      collect([
        shell('/de/posts/[id]', '/[lang]/posts/[id]'),
        shell('/en/posts/[id]', '/[lang]/posts/[id]'),
        plain('/[lang]/posts/[id]'),
      ])
    ).toEqual({
      runs: {
        '/de/posts/[id]': { prefixes: ['de', 'en'], tail: 'posts/[id]' },
      },
      replaced: ['/en/posts/[id]'],
    })
  })

  it('keeps shells that another route separates', () => {
    // The entry would take the position of the first shell, so it would move
    // ahead of the route between the two.
    expect(
      collect([
        shell('/de/posts/[id]', '/[lang]/posts/[id]'),
        plain('/other/[id]'),
        shell('/en/posts/[id]', '/[lang]/posts/[id]'),
      ])
    ).toEqual({ runs: {}, replaced: [] })
  })

  it('keeps shells that disagree on `fallback: false`', () => {
    // One entry carries one set of conditions, so it cannot serve both.
    expect(
      collect(
        [
          shell('/de/posts/[id]', '/[lang]/posts/[id]'),
          shell('/en/posts/[id]', '/[lang]/posts/[id]'),
        ],
        ['/en/posts/[id]']
      )
    ).toEqual({ runs: {}, replaced: [] })
  })

  it('keeps shells whose resolved segment is not the first one', () => {
    // The prefix of a shell starts at the first segment, so `/docs` in front of
    // the resolved segment puts these outside what the caller can rewrite.
    expect(
      collect([
        shell('/docs/de/posts/[id]', '/docs/[lang]/posts/[id]'),
        shell('/docs/en/posts/[id]', '/docs/[lang]/posts/[id]'),
      ])
    ).toEqual({ runs: {}, replaced: [] })
  })

  it('keeps shells that resolve every segment', () => {
    // The pattern for `/de` ends after the prefix, so it has no slash for the
    // caller to replace. A build cannot produce this shape, because it derives
    // a fallback shell only from a prerender that leaves a param unresolved.
    expect(collect([shell('/de', '/[lang]'), shell('/en', '/[lang]')])).toEqual(
      { runs: {}, replaced: [] }
    )
  })
})
