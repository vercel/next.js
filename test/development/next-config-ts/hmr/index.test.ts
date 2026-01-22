import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('next-config-ts - dev-hmr', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })
  it('should output config file change', async () => {
    await retry(
      async () => {
        expect(next.cliOutput).toMatch(/ready/i)
      },
      30000,
      1000
    )

    await retry(
      async () => {
        await next.patchFile('next.config.ts', (content) => {
          return content.replace(
            '// target',
            `async redirects() {
            return [
              {
                source: '/about',
                destination: '/',
                permanent: false,
              },
            ]
          },`
          )
        })
        expect(next.cliOutput).toMatch(
          /Found a change in next\.config\.ts\. Restarting the server to apply the changes\.\.\./
        )
      },
      30000,
      1000
    )

    await retry(
      async () => {
        const res = await next.fetch('/about')
        expect(res.status).toBe(200)
      },
      30000,
      1000
    )
  })
})
