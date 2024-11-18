import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - top-level await (project ESM)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: {
      type: 'module',
    },
  })

  it('should support top-level await (project ESM)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
