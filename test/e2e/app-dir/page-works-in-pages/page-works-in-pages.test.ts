import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'page works in pages',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('app page works', async () => {
      const $ = await next.render$('/')
      expect($('p').text()).toBe('App')
    })

    it('pages page works', async () => {
      const $ = await next.render$('/page')
      expect($('p').text()).toBe('Pages')
    })
  }
)
