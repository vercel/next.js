/* eslint-env jest */
import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

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
    await check(() => next.cliOutput, /ready/i)
    await check(
      () => next.cliOutput,
      new RegExp('please use the built-in `next/font` instead')
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
    await check(() => next.cliOutput, /ready/i)
    expect(next.cliOutput).not.toInclude(
      'please use the built-in `next/font` instead'
    )

    await next.stop()
    await next.clean()
  })
})
