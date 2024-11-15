import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - config as async function (project CJS)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: {
      type: 'commonjs',
    },
  })

  it('should support config as async function', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
