import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-import-node-modules', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should import from node_modules', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
