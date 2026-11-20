import { readFile } from 'fs/promises'
import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'

type Outputs = Parameters<NextAdapter['onBuildComplete']>[0]['outputs']

// Request Insights and the local span recorder that it imports are only used
// by the development server. Each of these modules contains its string, so a
// file with the string contains a copy of the module.
const DEV_ONLY_MODULES = {
  'request-insights': '@next/request-insights-store',
  'local-span-recorder': 'local-span-storage',
  'span-store': 'local-span-sink',
}

const normalize = (file: string) => file.replace(/\\/g, '/')

// The local span recorder imports the OpenTelemetry API. An entrypoint that
// bundles it evaluates a second copy of the API on its first request.

// This test accesses the filesystem, which is not available in deploy mode
// @force-gate !deploy
describe('entrypoints-no-request-insights', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should serve the route handler and the page', async () => {
    const res = await next.fetch('/api/route-handler')
    expect(await res.json()).toEqual({
      entry: 'route handler',
      data: { value: 1 },
    })

    expect(await next.render('/app-page')).toContain('app page')
  })

  it('should not bundle Request Insights into the Node.js entrypoints', async () => {
    // If a module is renamed or loses its string, this fails instead of the
    // check below passing.
    for (const [name, marker] of Object.entries(DEV_ONLY_MODULES)) {
      const source = await readFile(
        require.resolve(`next/dist/server/lib/trace/${name}`),
        'utf8'
      )
      expect(source).toContain(marker)
    }

    const { outputs }: { outputs: Outputs } = await next.readJSON(
      'build-complete.json'
    )

    const entrypoints = [
      ...outputs.appRoutes,
      ...outputs.appPages,
      ...outputs.pages,
      ...outputs.pagesApi,
    ].filter((output) => output.runtime === 'nodejs')

    expect(entrypoints.map((output) => output.pathname)).toEqual(
      expect.arrayContaining(['/api/route-handler', '/app-page'])
    )

    const contents = new Map<string, Promise<string>>()
    const read = (file: string) => {
      if (!contents.has(file)) {
        contents.set(file, readFile(file, 'utf8'))
      }
      return contents.get(file)!
    }

    const bundledCopies: Record<string, string[]> = {}
    for (const output of entrypoints) {
      const files = [output.filePath, ...Object.values(output.assets)]
        .map(normalize)
        // Everything outside of `node_modules` is output of the bundler.
        .filter(
          (file) => file.endsWith('.js') && !file.includes('/node_modules/')
        )

      expect(files).not.toEqual([])

      for (const file of files) {
        const content = await read(file)
        for (const [name, marker] of Object.entries(DEV_ONLY_MODULES)) {
          if (content.includes(marker)) {
            ;(bundledCopies[output.pathname] ??= []).push(
              `${name} in ${file.slice(file.lastIndexOf('/') + 1)}`
            )
          }
        }
      }
    }

    expect(bundledCopies).toEqual({})
  })
})
