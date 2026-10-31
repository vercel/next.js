import { nextTestSetup } from 'e2e-utils'

// A native addon declared with `NODE_MODULE` rather than `NODE_MODULE_INIT` can
// only be loaded once per process, so loading it on a second thread of that
// process fails with `ERR_DLOPEN_FAILED` / "Module did not self-register".
//
// `next dev` runs some work on worker threads regardless of
// `experimental.workerThreads`: the dev validation pool hardcodes
// `enableWorkerThreads: true`. This asserts that evaluating a route still does not
// put such an addon on one of those threads, so it would catch a change that moved
// route evaluation onto that pool.
//
// The expectation is the same with and without Cache Components. Both were checked
// by logging `isMainThread` from the page's module scope: the route is evaluated on
// the main thread either way, so there is nothing to fork on here.
describe('non-context-aware addon in development', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // `bindings` is a direct dependency rather than one of the addon, and both use
    // `file:` so pnpm copies them into the virtual store. See the comments in
    // test/production/prerender-worker-threads for why neither is `link:`.
    dependencies: require('./package.json').dependencies,
  })

  it('should render a route that loads a non-context-aware addon', async () => {
    const $ = await next.render$('/')

    // `false` is the value the non-context-aware binary exports, so reading it back
    // confirms the addon was loaded rather than stubbed out.
    expect($('#context-aware').text()).toBe('false')
    expect(next.cliOutput).not.toContain('Module did not self-register')
  })
})
