import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('next-config-ts - dev-hmr', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })
  it('should output config file change', async () => {
    await check(async () => next.cliOutput, /ready/i)

    await check(async () => {
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
      return next.cliOutput
    }, /Found a change in next\.config\.ts\. Restarting the server to apply the changes\.\.\./)

    await check(() => next.fetch('/about').then((res) => res.status), 200)
  })
})
