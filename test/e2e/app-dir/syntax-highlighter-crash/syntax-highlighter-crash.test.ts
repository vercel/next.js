import { nextTestSetup } from 'e2e-utils'

describe('syntax-highlighter-crash', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      'react-syntax-highlighter': '15.5.0',
    },
  })

  it('should render the page', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })
})
