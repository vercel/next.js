import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app-dir root layout render once',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    it('should only render root layout once', async () => {
      let $ = await next.render$('/render-once')
      expect($('#counter').text()).toBe('0')
      $ = await next.render$('/render-once')
      expect($('#counter').text()).toBe('1')
      $ = await next.render$('/render-once')
      expect($('#counter').text()).toBe('2')
    })
  }
)
