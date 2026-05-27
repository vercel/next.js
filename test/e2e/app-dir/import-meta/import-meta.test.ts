import { nextTestSetup } from 'e2e-utils'

describe('import-meta', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should have import.meta.dirname defined', async () => {
    const $ = await next.render$('/')
    expect($('#dirname').text()).not.toBe('undefined')
    expect($('#dirname').text()).toContain('/')
  })

  it('should have import.meta.filename defined', async () => {
    const $ = await next.render$('/')
    expect($('#filename').text()).not.toBe('undefined')
    expect($('#filename').text()).toContain('/')
  })
})
