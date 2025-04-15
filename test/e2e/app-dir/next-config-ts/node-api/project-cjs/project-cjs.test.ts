import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts - node-api (project CJS)', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should be able to use Node.js API (project CJS)', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
