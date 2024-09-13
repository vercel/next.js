import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - turbopack', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    // explicitly ensure that turbopack is used
    startCommand: 'pnpm next dev --turbo',
  })
  it('should work with Turbopack', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
