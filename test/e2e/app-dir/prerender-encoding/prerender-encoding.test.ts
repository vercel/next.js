import { nextTestSetup } from 'e2e-utils'

describe('prerender-encoding', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should respond with the prerendered page correctly', async () => {
    const $ = await next.render$('/sticks%20%26%20stones')
    expect($('div').text()).toBe('params.id is sticks%20%26%20stones')
  })
})
