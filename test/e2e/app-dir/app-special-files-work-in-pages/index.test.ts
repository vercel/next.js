import { createNextDescribe } from 'e2e-utils'

// These issues are caused by weird caching of pages so we need to have clean .next in each of these

createNextDescribe(
  'navigation fron app/page.tsx -> pages/page.tsx',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should works', async () => {
      let $ = await next.render$('/')
      expect($('p').text()).toBe('app/page.tsx')

      $ = await next.render$('/page')
      expect($('p').text()).toBe('pages/page.tsx')
    })
  }
)

createNextDescribe(
  'navigation fron pages/page.tsx -> app/page.tsx',
  {
    files: __dirname,
  },
  ({ next }) => {
    // eslint-disable-next-line jest/no-identical-title
    it('should works', async () => {
      let $ = await next.render$('/page')
      expect($('p').text()).toBe('pages/page.tsx')

      $ = await next.render$('/')
      expect($('p').text()).toBe('app/page.tsx')
    })
  }
)
