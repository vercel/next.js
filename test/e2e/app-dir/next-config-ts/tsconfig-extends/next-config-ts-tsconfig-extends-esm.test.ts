import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-tsconfig-extends-esm', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: {
      type: 'module',
    },
  })

  it('should support tsconfig extends (ESM)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foobar')
  })
})
