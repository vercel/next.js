import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'app dir - metadata dynamic routes suspense',
  {
    files: __dirname,
    skipDeployment: true,
  },
  ({ next }) => {
    it('should render metadata in head even root layout is wrapped with Suspense', async () => {
      const $ = await next.render$('/')
      expect($('head title').text()).toBe('My title')
      expect($('head meta[name="application-name"]').attr('content')).toBe(
        'suspense-app'
      )

      expect($('body meta').length).toBe(0)
    })
  }
)
