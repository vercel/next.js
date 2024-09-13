import { nextTestSetup } from 'e2e-utils'

describe('next-config-ts-config-as-async-function', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should support config as async function', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('foo')
  })
})
