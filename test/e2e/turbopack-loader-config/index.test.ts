import { nextTestSetup } from 'e2e-utils'

describe('turbopack-loader-config', () => {
  const { next, isTurbopack, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
    // we can't set `nextConfig` inline because it contains regexes that fail to serialize, it needs
    // to be set in a separate module (`next.config.ts`)
  })

  if (skipped) {
    return
  }

  if (!isTurbopack) {
    it('should only run the test in turbopack', () => {})
    return
  }

  it('should replace modules with their loader-generated versions', async () => {
    const response = JSON.parse(await next.render('/api'))
    expect(response).toEqual({
      foo: 'default return value',
      bar: 'has export substring' + (isNextDev ? ' on dev' : ' on prod'),
    })
  })
})
