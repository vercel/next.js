import { nextTestSetup } from 'e2e-utils'

describe('app-dir - metadata-icons', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should only have 1 favicon link in root page', async () => {
    const $ = await next.render$('/')
    expect($('link[href^="/favicon.ico"]').length).toBe(1)
  })

  it('should only have 1 favicon link in nested page', async () => {
    const $ = await next.render$('/nested')
    expect($('link[href^="/favicon.ico"]').length).toBe(1)
  })

  it('should render custom icons along with favicon in root page', async () => {
    const $ = await next.render$('/')
    expect($('link[rel="shortcut icon"]').attr('href')).toBe(
      '/shortcut-icon.png'
    )
  })

  it('should render custom icons along with favicon in nested page', async () => {
    const $ = await next.render$('/nested')
    expect($('link[rel="shortcut icon"]').attr('href')).toBe(
      '/shortcut-icon-nested.png'
    )
  })
})
