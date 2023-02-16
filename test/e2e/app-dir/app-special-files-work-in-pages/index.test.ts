import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'App special files work in pages',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('app page works', async () => {
      const $ = await next.render$('/')
      expect($('p').text()).toBe('App')
    })

    it('pages/page.tsx works', async () => {
      const $ = await next.render$('/page')
      expect($('p').text()).toBe('pages/page')
    })

    it('pages/layout.tsx works', async () => {
      const $ = await next.render$('/layout')
      expect($('p').text()).toBe('pages/layout')
    })

    it('pages/not-found.tsx works', async () => {
      const $ = await next.render$('/not-found')
      expect($('p').text()).toBe('pages/not-found')
    })
  }
)
