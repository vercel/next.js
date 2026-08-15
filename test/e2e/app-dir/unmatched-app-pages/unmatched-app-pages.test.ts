import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

describe('unmatched-app-pages', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })

  if (skipped) return

  it('reports every page excluded from all complete routes', async () => {
    let output: string
    if (isNextDev) {
      await next.start()
      const response = await (await next.fetch('/disagreeing-slots/foo')).text()
      // Webpack reports the structural error through HMR and may render an
      // older loader error for this request. Turbopack renders the structural
      // issue in the response. The terminal consistently reports it for both.
      output = `${next.cliOutput}\n${response}`
    } else {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(1)
      output = next.cliOutput
    }

    output = stripAnsi(output)
    expect(output).toContain('match any complete route')
    expect(output).toContain('app/disagreeing-slots/@first/foo/page.tsx')
    expect(output).toContain('app/disagreeing-slots/@second/bar/page.tsx')
    expect(output).toContain('app/disagreeing-slots/[...slug]/page.tsx')
    expect(output).toContain('app/declared-children/@panel/details/page.tsx')
    expect(output).toContain('app/optional-catchall/[[...slug]]/page.tsx')
    expect(output).toContain('app/(pruning-group)/grouped/[...slug]/page.tsx')
    expect(output).toContain('app/nested-parallel/@outer/[...slug]/page.tsx')
    expect(output).toContain('app/nested-parallel/[...slug]/page.tsx')
    expect(output).toContain(
      'app/interception-host/@canonical/intercepted/[...slug]/page.tsx'
    )
    expect(output).not.toContain('app/optional-catchall/specific/page.tsx')
    expect(output).not.toContain(
      'app/(pruning-group)/grouped/specific/page.tsx'
    )
    expect(output).not.toContain(
      'app/nested-parallel/@outer/@inner/specific/page.tsx'
    )
    expect(output).not.toContain(
      'app/interception-host/@modal/(.)intercepted/[...slug]/page.tsx'
    )
    expect(output).not.toContain('app/declared-children/page.tsx')
  })
})
