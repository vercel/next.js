import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'createNextDescribe',
  {
    files: __dirname,
  },
  ({ next }) => {
    it('should work', async () => {
      const res = await next.fetch('/')
      expect(await res.text()).toContain('Hello World')
    })

    it('temporary test', async () => {
      const $ = await next.render$('/')
      console.log($('body').html())
      expect($('#test').text()).toBe('arst3')
    })
  }
)
