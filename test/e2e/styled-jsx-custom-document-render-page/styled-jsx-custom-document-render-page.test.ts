import { nextTestSetup } from 'e2e-utils'

describe('styled-jsx-custom-document-render-page', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should include styled-jsx styles when Document.getInitialProps does not collect them', async () => {
    const $ = await next.render$('/')
    expect($('p.greeting').text()).toBe('hello world')
    expect($('style').text()).toMatch(/color:\s*rebeccapurple/)
  })
})
