import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - dynamic import (project ESM)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    packageJson: {
      type: 'module',
    },
  })

  it('should support dynamic import (project ESM)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
