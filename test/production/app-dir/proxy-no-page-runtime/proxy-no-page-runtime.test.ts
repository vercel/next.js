import { nextTestSetup } from 'e2e-utils'
import type { NextAdapter } from 'next'

type Outputs = Parameters<NextAdapter['onBuildComplete']>[0]['outputs']

const isPageRuntime = (file: string) =>
  /app-page.*\.runtime\.prod\.js$/.test(file)

// A proxy that only imports `next/server` must not pull in the app-page runtime.
// It's expensive to load on a cold start and was previously reachable through
// `connection()` -> `dynamic-rendering`, which imported React.

// This test accesses the filesystem, which is not available in deploy mode
// @force-gate !deploy
describe('proxy-no-page-runtime', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should run the proxy', async () => {
    const res = await next.fetch('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-from-proxy')).toBe('1')
  })

  it('should not include the app-page runtime in the proxy output', async () => {
    const { outputs }: { outputs: Outputs } = await next.readJSON(
      'build-complete.json'
    )

    // The app-page runtime as the page outputs trace it. If it is renamed or
    // stops being traced, this fails instead of the check below passing.
    const pageRuntimeFiles = [
      ...new Set(
        outputs.appPages.flatMap((output) =>
          Object.keys(output.assets).filter(isPageRuntime)
        )
      ),
    ]
    expect(pageRuntimeFiles).not.toEqual([])

    expect(outputs.middleware).toBeDefined()
    const proxyFiles = Object.keys(outputs.middleware!.assets)
    expect(proxyFiles).not.toEqual([])
    expect(
      proxyFiles.filter((file) => pageRuntimeFiles.includes(file))
    ).toEqual([])
  })

  // The proxy doesn't read the manifests that Node.js route handlers need, so
  // they are left out of its output. Some of them (e.g. `BUILD_ID`) change on
  // every build and would otherwise change the proxy's asset hashes.
  it('should not include required server files in the proxy output', async () => {
    const { outputs }: { outputs: Outputs } = await next.readJSON(
      'build-complete.json'
    )
    const { files: requiredServerFiles }: { files: string[] } =
      await next.readJSON('.next/required-server-files.json')

    const normalize = (file: string) => file.replace(/\\/g, '/')
    const findRequiredServerFiles = (files: string[]) =>
      requiredServerFiles
        .map(normalize)
        .filter((requiredFile) =>
          files.some((file) => normalize(file).endsWith(requiredFile))
        )

    expect(outputs.middleware).toBeDefined()
    const proxy = outputs.middleware!
    expect(proxy.runtime).toBe('nodejs')

    expect(requiredServerFiles.map(normalize)).toContain(
      '.next/prerender-manifest.json'
    )

    // The distDir `package.json` (the CommonJS boundary) is still needed.
    expect(findRequiredServerFiles(Object.keys(proxy.assets))).toEqual([
      '.next/package.json',
    ])
    expect(
      findRequiredServerFiles(Object.keys(proxy.assetsHashes ?? {}))
    ).toBeOneOf([[], ['.next/package.json']])

    // Route handlers still get them.
    for (const output of outputs.appPages) {
      expect(findRequiredServerFiles(Object.keys(output.assets))).toContain(
        '.next/prerender-manifest.json'
      )
    }
  })
})
