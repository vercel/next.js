import { FileRef, nextTestSetup } from 'e2e-utils'
import { shouldUseTurbopack } from 'next-test-utils'
import { join } from 'path'

describe('turbopack wasm output tracing', () => {
  // npm deployments do not support pnpm's link protocol.
  const localPackageProtocol = (global as any).isNextDeploy ? 'file' : 'link'
  const { next, isTurbopack, isNextStart, isNextDeploy } = nextTestSetup({
    files: __dirname,
    // This route exercises Turbopack's built-in wasm loader. The external
    // package and non-wasm routes also run with webpack.
    overrideFiles: shouldUseTurbopack()
      ? {
          'app/api/workspace-wasm/route.js': new FileRef(
            join(__dirname, 'workspace-wasm-route.js')
          ),
        }
      : {},
    dependencies: {
      'wasm-dep': 'file:./wasm-dep',
      'workspace-wasm': `${localPackageProtocol}:./workspace-wasm`,
      'unused-dep': `${localPackageProtocol}:./unused-dep`,
    },
    packageJson: {
      devDependencies: {
        'unused-dev-dep': `${localPackageProtocol}:./unused-dev-dep`,
      },
    },
  })

  it('builds and serves a node route whose external package references a wasm module', async () => {
    const res = await next.fetch('/api/wasm')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ result: 2 })
  })

  // The bundled wasm route is only installed for Turbopack.
  // @force-gate turbopack
  it('executes a wasm module imported by a workspace package', async () => {
    const res = await next.fetch('/api/workspace-wasm')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ result: 2 })
  })

  it('serves a non-wasm route that reads a required runtime file', async () => {
    const res = await next.fetch('/api/no-wasm')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ result: 'required runtime file' })
  })

  if (isNextStart && !isNextDeploy) {
    it.each(['wasm', 'no-wasm', ...(isTurbopack ? ['workspace-wasm'] : [])])(
      'does not trace unrelated dependencies or workspace files for %s',
      async (route) => {
        const trace = (await next.readJSON(
          `.next/server/app/api/${route}/route.js.nft.json`
        )) as { files: string[] }
        const files = trace.files.map((file) => file.replace(/\\/g, '/'))

        expect(files.filter((file) => file.includes('unused-'))).toEqual([])

        if (route === 'no-wasm') {
          expect(files).toContainEqual(
            expect.stringMatching(/\/required\.txt$/)
          )
          expect(files.filter((file) => file.endsWith('.wasm'))).toEqual([])
        } else if (route === 'workspace-wasm' && isTurbopack) {
          expect(files).toContainEqual(
            expect.stringMatching(/\/chunks\/[^/]+\.wasm$/)
          )
        } else {
          expect(files).toContainEqual(expect.stringMatching(/\.wasm$/))
        }
      }
    )

    it('does not list the embedded wasm runtime helper in the route trace', async () => {
      const trace = (await next.readJSON(
        '.next/server/app/api/wasm/route.js.nft.json'
      )) as { files: string[] }

      // The `[turbopack-wasm]/**/loadWasm.ts` helper is compiled into the output
      // chunk, it is not a deployable source file. Tracing it used to fail the
      // build outright, because a traced file has to live in the project or in
      // the output directory.
      expect(
        trace.files.filter(
          (file) => file.includes('turbopack-wasm') || file.includes('loadWasm')
        )
      ).toEqual([])

      if (isTurbopack) {
        // The wasm file itself has to stay in the trace, the external package
        // reads it at runtime.
        expect(trace.files.some((file) => file.endsWith('add.wasm'))).toBe(true)
        expect(trace.files).toContainEqual(
          expect.stringMatching(/[/\\]wasm-dep[/\\]index\.js$/)
        )
      }
    })
  }
})
