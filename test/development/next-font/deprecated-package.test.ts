/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('Deprecated @next/font warning', () => {
  const { next, skipped } = nextTestSetup({
    files: {
      'pages/index.js': '',
    },
    dependencies: {
      '@next/font': 'canary',
    },
    skipStart: true,
  })
  if (skipped) return

  it('should warn if @next/font is in deps', async () => {
    await next.start()
    await retry(
      () => {
        expect(next.cliOutput).toMatch(/ready/i)
      },
      30000,
      1000
    )
    await retry(
      () => {
        expect(next.cliOutput).toMatch(
          new RegExp('please use the built-in `next/font` instead')
        )
      },
      30000,
      1000
    )

    await next.stop()
    await next.clean()
  })

  it('should not warn if @next/font is not in deps', async () => {
    // Remove @next/font from deps
    const packageJson = JSON.parse(await next.readFile('package.json'))
    delete packageJson.dependencies['@next/font']
    await next.patchFile('package.json', JSON.stringify(packageJson))

    await next.start()
    await retry(
      () => {
        expect(next.cliOutput).toMatch(/ready/i)
      },
      30000,
      1000
    )
    expect(next.cliOutput).not.toInclude(
      'please use the built-in `next/font` instead'
    )

    await next.stop()
    await next.clean()
  })
})
