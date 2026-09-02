import { nextTestSetup } from 'e2e-utils'

// TODO(deploy-test-completion): Remove this suite from the deploy manifest.
// It was excluded as a known deploy failure without a documented root cause.
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
