import { nextTestSetup } from 'e2e-utils'

describe('turbopack wasm output tracing', () => {
  const { next, isTurbopack, isNextStart, isNextDeploy } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'wasm-dep': 'file:./wasm-dep',
    },
  })

  it('builds and serves a node route whose external package references a wasm module', async () => {
    const res = await next.fetch('/api/wasm')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ result: 2 })
  })

  if (isNextStart && !isNextDeploy) {
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
      }
    })
  }
})
