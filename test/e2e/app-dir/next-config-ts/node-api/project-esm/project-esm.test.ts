import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - node-api (project ESM)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: {
      type: 'module',
    },
  })

  it('should be able to use Node.js API (project ESM)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
