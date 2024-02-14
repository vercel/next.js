import { createNextDescribe } from 'e2e-utils'

createNextDescribe(
  'styled-jsx',
  {
    files: __dirname,
    skipDeployment: true,
    dependencies: {
      'styled-jsx': '5.0.0', // styled-jsx on user side
    },
  },
  ({ next }) => {
    it('should contain styled-jsx styles during SSR', async () => {
      const html = await next.render('/')
      expect(html).toMatch(/color:.*?red/)
      expect(html).toMatch(/color:.*?cyan/)
    })

    it('should render styles during CSR', async () => {
      const browser = await next.browser('/')
      const color = await browser.eval(
        `getComputedStyle(document.querySelector('button')).color`
      )

      expect(color).toMatch('0, 255, 255')
    })

    it('should render styles during CSR (AMP)', async () => {
      const browser = await next.browser('/amp')
      const color = await browser.eval(
        `getComputedStyle(document.querySelector('button')).color`
      )

      expect(color).toMatch('0, 255, 255')
    })

    it('should render styles during SSR (AMP)', async () => {
      const html = await next.render('/amp')
      expect(html).toMatch(/color:.*?cyan/)
    })
  }
)
