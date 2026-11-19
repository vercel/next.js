import {
  nextTestSetup,
  FileRef,
  isNextDeploy,
  isNextDev,
  isNextStart,
} from 'e2e-utils'
import * as path from 'path'

// webpack only externalizes packages whose resolved path is inside of node_modules, so
// the fixture fails to build there.
// @force-gate turbopack
describe('server-external-packages-workspace-link', () => {
  const { next } = nextTestSetup({
    files: {
      apps: new FileRef(path.resolve(__dirname, 'apps')),
      packages: new FileRef(path.resolve(__dirname, 'packages')),
      'vercel.json': new FileRef(path.resolve(__dirname, 'vercel.json')),
      'pnpm-workspace.yaml': `packages:
      - 'apps/*'
      - 'packages/*'
      `,
    },
    packageJson: require('./package.json'),
    buildCommand: 'pnpm build',
    startCommand: isNextDev ? 'pnpm dev' : 'pnpm start',
    installCommand: 'pnpm i',
  })

  // `my-wasm-pkg` is a pnpm workspace package. It's symlinked into
  // `apps/web/node_modules` and resolves to its real path outside of node_modules.
  it('should not bundle a workspace package listed in serverExternalPackages', async () => {
    const res = await next.fetch('/api/x')
    expect(res.status).toBe(200)
    const { sum, answer, moduleUrl, wasmPath } = await res.json()
    expect(sum).toBe(3)
    expect(answer).toBe(42)
    // When bundled, `import.meta.url` and `__dirname` are replaced with
    // virtual `/ROOT/...` paths that don't exist at runtime.
    expect(moduleUrl).not.toContain('/ROOT/')
    expect(moduleUrl).toMatch(/packages\/my-wasm-pkg\/node\/index\.js$/)
    expect(wasmPath).not.toMatch(/^\/ROOT\//)
    expect(wasmPath).toMatch(
      /packages[/\\]my-wasm-pkg[/\\]wasm[/\\]my_wasm_bg\.wasm$/
    )
  })

  if (isNextStart && !isNextDeploy) {
    it('should trace the files of the external workspace package', async () => {
      const { files } = JSON.parse(
        await next.readFile('apps/web/.next/server/app/api/x/route.js.nft.json')
      )
      const tracedFiles = (files as string[]).map((file) =>
        path.posix.normalize(
          path.posix.join('apps/web/.next/server/app/api/x', file)
        )
      )
      expect(tracedFiles).toEqual(
        expect.arrayContaining([
          'packages/my-wasm-pkg/package.json',
          'packages/my-wasm-pkg/node/index.js',
          'packages/my-wasm-pkg/wasm/my_wasm.cjs',
          'packages/my-wasm-dep/package.json',
          'packages/my-wasm-dep/index.js',
        ])
      )
    })
  }
})
