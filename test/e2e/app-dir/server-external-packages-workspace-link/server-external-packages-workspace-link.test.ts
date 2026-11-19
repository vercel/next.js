import { nextTestSetup, isNextDeploy } from 'e2e-utils'

// webpack only externalizes packages whose resolved path is inside of node_modules, so
// the fixture fails to build there.
// @force-gate turbopack
describe('server-external-packages-workspace-link', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: isNextDeploy
      ? // `link` is incompatible with the npm version used when this test is deployed
        { 'my-wasm-pkg': 'file:./my-wasm-pkg' }
      : // A symlinked (workspace-style) package whose real path is outside of node_modules
        { 'my-wasm-pkg': 'link:./my-wasm-pkg' },
  })

  it('should not bundle a symlinked package listed in serverExternalPackages', async () => {
    const res = await next.fetch('/api/x')
    expect(res.status).toBe(200)
    const { sum, moduleUrl, wasmPath } = await res.json()
    expect(sum).toBe(3)
    // When bundled, `import.meta.url` and `__dirname` are replaced with
    // virtual `/ROOT/...` paths that don't exist at runtime.
    expect(moduleUrl).not.toContain('/ROOT/')
    expect(moduleUrl).toMatch(/my-wasm-pkg\/node\/index\.js$/)
    expect(wasmPath).not.toMatch(/^\/ROOT\//)
    expect(wasmPath).toMatch(/my-wasm-pkg[/\\]wasm[/\\]my_wasm_bg\.wasm$/)
  })
})
