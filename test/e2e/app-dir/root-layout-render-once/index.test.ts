import { nextTestSetup } from 'e2e-utils'

describe('app-dir root layout render once', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should only render root layout once', async () => {
    let $ = await next.render$('/render-once')
    expect($('#counter').text()).toBe('0')
    $ = await next.render$('/render-once')
    expect($('#counter').text()).toBe('1')
    $ = await next.render$('/render-once')
    expect($('#counter').text()).toBe('2')
  })
})
