import { nextTestSetup } from 'e2e-utils'

describe('react-dnd-compile', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@react-dnd/asap': '^5.0.1',
      '@react-dnd/invariant': '^4.0.2',
      'dnd-core': '14.0.1',
      'react-dnd': '^16.0.1',
      'react-dnd-html5-backend': '^16.0.1',
    },
  })

  it('should work', async () => {
    const $ = await next.render$('/')
    expect($('#index-page-title').text()).toBe('Hello, Next.js!')
  })

  it('should work on react-dnd import page', async () => {
    const $ = await next.render$('/oom')
    expect($('#oom-page-title').text()).toBe('Hello, Next.js!')
  })
})
