import { nextTestSetup } from 'e2e-utils'

describe('compiled-picomatch', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should protect against repeated extglob ReDoS patterns', async () => {
    const $ = await next.render$('/')
    expect($('#regex-source').text()).toBe('^(?:\\+\\(a\\|aa\\))$')
  })
})
