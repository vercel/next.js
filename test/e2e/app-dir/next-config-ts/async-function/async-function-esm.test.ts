import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-async-function-esm', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: {
      type: 'module',
    },
  })

  it('should support config as async function (ESM)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
