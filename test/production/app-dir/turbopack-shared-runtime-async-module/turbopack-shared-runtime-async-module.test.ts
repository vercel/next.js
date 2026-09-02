import { nextTestSetup } from 'e2e-utils'

// The chunks Turbopack builds for build-time Node.js evaluation (webpack
// loaders, postcss configs, next/font/google, ...) all share a single
// `[turbopack]_runtime.js` at a fixed path, but each transform builds its own
// module graph. A graph without async modules must therefore not strip the
// async-module (top-level await) machinery from that runtime: chunks belonging
// to another graph may call `__turbopack_context__.a(...)`, and which variant
// wins the write depends on emission order.
//
// This fixture uses a single fully synchronous loader, so its graph contains no
// async modules. That alone used to be enough to emit a runtime without `.a`,
// which broke any build where a postcss config or another loader needed it.
// `.next/build/chunks` is Turbopack-only, so this is skipped for webpack.
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'turbopack-shared-runtime-async-module',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
    })

    it('keeps the async-module runtime in the shared build-time runtime chunk', async () => {
      const runtime = await next.readFile(
        '.next/build/chunks/[turbopack]_runtime.js'
      )

      // `asyncModule` is what gets installed as `__turbopack_context__.a`.
      expect(runtime).toContain('contextPrototype.a = asyncModule')
    })

    it('renders a page transformed by the loader', async () => {
      const $ = await next.render$('/')
      expect($('p').text()).toContain('from-loader')
    })
  }
)
