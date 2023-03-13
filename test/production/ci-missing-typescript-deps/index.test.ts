import { createNext } from 'e2e-utils'

describe('ci-missing-typescript-deps', () => {
  it('should show missing TypeScript dependencies error in CI', async () => {
    const next = await createNext({
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
    try {
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
    } finally {
      await next.destroy()
    }
  })
})
