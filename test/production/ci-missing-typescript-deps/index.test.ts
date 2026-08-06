import { nextTestSetup } from 'e2e-utils'

describe('ci-missing-typescript-deps', () => {
  describe('missing typescript dep', () => {
    const { next, isTurbopack } = nextTestSetup({
      nextConfig: {
        experimental: { useTypeScriptCli: false },
      },
      files: {
        'app/page.tsx': `
          export default function Page() {
            return <p>hello world</p>
          }
        `,
        'app/layout.tsx': `
          export default function RootLayout({
            children,
          }: {
            children: React.ReactNode
          }) {
            return <html><body>{children}</body></html>
          }
        `,
      },
      env: {
        CI: '1',
      },
      skipStart: true,
      dependencies: {
        typescript: undefined,
      },
    })

    it('should show missing TypeScript dependencies error in CI', async () => {
      let error
      await next.start().catch((err) => {
        error = err
      })

      expect(error).toBeDefined()
      expect(next.cliOutput).toContain(
        `It looks like you're trying to use TypeScript but do not have the required package(s) installed.`
      )
      expect(next.cliOutput).toContain(`Please install`)
      expect(next.cliOutput).toContain(
        'pnpm install --save-dev typescript@^6.0.0'
      )
      expect(next.cliOutput).not.toContain('Call retries were exceeded')
      expect(next.cliOutput).not.toContain('WorkerError')
      expect(next.cliOutput).not.toContain('Build error occurred')
      expect(next.cliOutput).not.toContain('at ignore-listed frames')
    })

    it('should skip TypeScript setup for a JavaScript-only App project', async () => {
      await next.deleteFile('app/page.tsx')
      await next.deleteFile('app/layout.tsx')
      await next.deleteFile('tsconfig.json').catch(() => {})
      await next.deleteFile('next-env.d.ts').catch(() => {})
      await next.patchFile(
        'app/page.js',
        'export default function Page() { return <p>hello world</p> }'
      )
      await next.patchFile(
        'app/layout.js',
        `export default function RootLayout({ children }) {
          return <html><body>{children}</body></html>
        }`
      )

      const { cliOutput, exitCode } = await next.build()

      expect(exitCode).toBe(0)
      if (isTurbopack) {
        expect(cliOutput).not.toContain('Running TypeScript')
        expect(cliOutput).not.toContain('Finished TypeScript')
      }
      expect(await next.hasFile('tsconfig.json')).toBe(false)
      expect(await next.hasFile('next-env.d.ts')).toBe(false)
    })
  })

  describe('missing TypeScript CLI dependency', () => {
    const { next } = nextTestSetup({
      files: {
        'next.config.js': `
          module.exports = {
            experimental: { useTypeScriptCli: true },
          }
        `,
        'pages/index.tsx': `
          export default function Page() {
            return <p>hello world</p>
          }
        `,
      },
      env: {
        CI: '1',
      },
      skipStart: true,
      dependencies: {
        typescript: undefined,
      },
    })

    it('should recommend the latest TypeScript package in CI', async () => {
      let error
      await next.start().catch((err) => {
        error = err
      })

      expect(error).toBeDefined()
      expect(next.cliOutput).toContain('pnpm install --save-dev typescript')
      expect(next.cliOutput).not.toContain('typescript@^6.0.0')
      expect(next.cliOutput).not.toContain('Call retries were exceeded')
      expect(next.cliOutput).not.toContain('WorkerError')
    })
  })

  describe('with @types/react beta', () => {
    const { next } = nextTestSetup({
      files: {
        'pages/index.tsx': `
          export default function Page() {
            return <p>hello world</p>
          }
        `,
      },
      env: {
        CI: '1',
      },
      skipStart: true,
      dependencies: {
        '@types/react': 'npm:types-react@beta',
        '@types/react-dom': 'npm:types-react-dom@beta',
      },
      resolutions: {
        '@types/react': 'npm:types-react@beta',
        '@types/react-dom': 'npm:types-react-dom@beta',
      },
    })

    it('should not throw an error if beta version of @types/react and @types/react-dom is installed', async () => {
      const nextBuild = await next.build()
      expect(nextBuild.cliOutput).toContain(
        // matching the part of the success message that isn't colored.
        `We detected TypeScript in your project and created`
      )
    })
  })
})
