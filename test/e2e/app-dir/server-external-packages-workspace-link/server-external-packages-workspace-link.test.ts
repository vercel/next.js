import {
  nextTestSetup,
  FileRef,
  isNextDeploy,
  isNextDev,
  isNextStart,
} from 'e2e-utils'
import * as path from 'path'

// `my-wasm-pkg` is a pnpm workspace package listed in `serverExternalPackages`.
// It's symlinked into `apps/web/node_modules` and resolves to its real path
// outside of node_modules. It loads CommonJS glue code through a computed path,
// which only works when the package is external.
function setup(serverExternalPackagesMonorepo: boolean) {
  return nextTestSetup({
    files: {
      apps: new FileRef(path.resolve(__dirname, 'apps')),
      packages: new FileRef(path.resolve(__dirname, 'packages')),
      'vercel.json': new FileRef(path.resolve(__dirname, 'vercel.json')),
      'pnpm-workspace.yaml': `packages:
      - 'apps/*'
      - 'packages/*'
      `,
    },
    overrideFiles: {
      'apps/web/next.config.js': `
        /** @type {import('next').NextConfig} */
        module.exports = {
          serverExternalPackages: ['my-wasm-pkg'],
          experimental: {
            serverExternalPackagesMonorepo: ${serverExternalPackagesMonorepo},
          },
        }
      `,
    },
    packageJson: require('./package.json'),
    buildCommand: 'pnpm build',
    startCommand: isNextDev ? 'pnpm dev' : 'pnpm start',
    installCommand: 'pnpm i',
    skipStart: !serverExternalPackagesMonorepo,
  })
}

describe('server-external-packages-workspace-link', () => {
  describe('experimental.serverExternalPackagesMonorepo: true', () => {
    const { next } = setup(true)

    it('should not bundle a workspace package listed in serverExternalPackages', async () => {
      const res = await next.fetch('/api/x')
      expect(res.status).toBe(200)
      const { sum, answer, moduleUrl, wasmPath } = await res.json()
      expect(sum).toBe(3)
      expect(answer).toBe(42)
      // When bundled, `import.meta.url` and `__dirname` are replaced with
      // virtual or build-time paths instead of the runtime location.
      expect(moduleUrl).not.toContain('/ROOT/')
      expect(moduleUrl).toMatch(/packages\/my-wasm-pkg\/node\/index\.js$/)
      expect(wasmPath).not.toMatch(/^\/ROOT\//)
      expect(wasmPath).toMatch(
        /packages[/\\]my-wasm-pkg[/\\]wasm[/\\]my_wasm_bg\.wasm$/
      )
    })

    if (isNextStart) {
      it('should trace the files of the external workspace package', async () => {
        const { files } = JSON.parse(
          await next.readFile(
            'apps/web/.next/server/app/api/x/route.js.nft.json'
          )
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
            'packages/my-wasm-dep/index.js',
          ])
        )
      })
    }
  })

  // The build is expected to fail. A deployment with a failing build can't be
  // set up with `skipStart`, so the bundled case runs in dev and start only.
  ;(isNextDeploy ? describe.skip : describe)(
    'experimental.serverExternalPackagesMonorepo: false',
    () => {
      const { next, isTurbopack } = setup(false)

      // Without the flag, the workspace package is bundled (it doesn't resolve
      // into node_modules), so loading the glue through a computed path fails.
      if (isNextDev) {
        it('should bundle the workspace package and fail at runtime', async () => {
          await next.start()
          const res = await next.fetch('/api/x')
          expect(res.status).toBe(500)
        })
      } else {
        it('should bundle the workspace package and fail the build', async () => {
          const { exitCode, cliOutput } = await next.build()
          expect(exitCode).not.toBe(0)
          expect(cliOutput).toContain('Failed to collect page data for /api/x')
          if (isTurbopack) {
            expect(cliOutput).toContain(
              'Cannot find module as expression is too dynamic'
            )
          } else {
            expect(cliOutput).toContain('ERR_INVALID_ARG_TYPE')
          }
        })
      }
    }
  )
})
