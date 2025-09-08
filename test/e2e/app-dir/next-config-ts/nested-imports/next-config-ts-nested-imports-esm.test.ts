import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-nested-imports-esm', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: {
      type: 'module',
    },
  })

  it('should handle nested imports (ESM)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foobarbaz')
  })
})
