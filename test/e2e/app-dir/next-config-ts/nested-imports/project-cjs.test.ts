import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - nested imports (project CJS)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should handle nested imports (project CJS)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foobarbaz')
  })
})
