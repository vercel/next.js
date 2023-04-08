import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'custom server',
  {
    files: __dirname,
    startCommand: 'node server.js',
  },
  ({ next }) => {
    it.each(['a', 'b', 'c'])('can navigate to /%s', async (page) => {
      const $ = await next.render$(`/${page}`)
      expect($('p').text()).toBe(`Page ${page}`)
    })
  }
)
