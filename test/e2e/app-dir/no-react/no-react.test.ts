import { nextTestSetup } from 'e2e-utils'

describe('app-dir no-react', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skippedDependencies: ['react', 'react-dom'],
  })

  it('should render without react, react-dom in App Router', async () => {
    const $ = await next.render$('/')
    expect($('p').text()).toBe('hello world')
  })
})
