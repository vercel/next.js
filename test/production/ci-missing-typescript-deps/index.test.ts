import { nextTestSetup } from 'e2e-utils'

describe('ci-missing-typescript-deps', () => {
  describe('missing typescript dep', () => {
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
      packageJson: {
        overrides: {
          '@types/react': 'npm:types-react@beta',
          '@types/react-dom': 'npm:types-react-dom@beta',
        },
        pnpm: {
          overrides: {
            '@types/react': 'npm:types-react@beta',
            '@types/react-dom': 'npm:types-react-dom@beta',
          },
        },
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
