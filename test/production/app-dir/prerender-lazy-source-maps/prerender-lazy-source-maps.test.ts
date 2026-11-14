import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

function normalizeCliOutput(output: string) {
  // Windows paths use backslashes.
  return stripAnsi(output).replaceAll('\\', '/')
}

describe('prerender-lazy-source-maps', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('source-maps prerender errors without enabling Node.js source maps', async () => {
    const { exitCode, cliOutput } = await next.build()
    const output = normalizeCliOutput(cliOutput)

    expect(exitCode).toBe(1)

    // The source maps are read lazily, so the prerender workers run without
    // `--enable-source-maps`, which loads them eagerly for every module.
    expect(output).toContain(
      'Error: logged prerender error (sourceMapsEnabled: false)'
    )
    // Already the first error formatted in the worker is source-mapped and has
    // a code frame. Columns are flaky in Webpack.
    expect(output).toMatch(
      /at \S+ \((webpack:\/\/\S*\/)?app\/first\/page\.tsx:4:\d+\)/
    )
    expect(output).toContain('> 4 |     new Error(\n')

    // And so are later ones, which reuse the source maps read before.
    expect(output).toContain('Error: thrown prerender error')
    expect(output).toMatch(
      /at \S+ \((webpack:\/\/\S*\/)?app\/first\/page\.tsx:11:\d+\)/
    )
  })

  it('does not source-map prerender errors with enablePrerenderSourceMaps: false', async () => {
    await next.patchFile('next.config.ts', (config) =>
      config.replace(
        'experimental: {',
        'enablePrerenderSourceMaps: false,\n  experimental: {'
      )
    )
    try {
      const { exitCode, cliOutput } = await next.build()
      const output = normalizeCliOutput(cliOutput)

      expect(exitCode).toBe(1)
      expect(output).toContain(
        'Error: logged prerender error (sourceMapsEnabled: false)'
      )
      expect(output).not.toMatch(/app\/first\/page\.tsx:\d+:\d+/)
      expect(output).toMatch(/at \S+ \(\.next\/server\/\S+\.js:\d+:\d+\)/)
    } finally {
      await next.patchFile('next.config.ts', (config) =>
        config.replace('enablePrerenderSourceMaps: false,\n  ', '')
      )
    }
  })
})
