import { createNextDescribe } from 'e2e-utils'

for (const item of ['trailing-slash', 'no-trailing-slash']) {
  createNextDescribe(
    `html-extension-navigation-bug-${item}`,
    {
      files: __dirname,
      nextConfig: {
        trailingSlash: item === 'trailing-slash',
      },
    },
    ({ next }) => {
      describe('with .html extension', () => {
        it('should work when requesting the page directly', async () => {
          const $ = await next.render$(
            '/product/shirts_and_tops/mens_ua_playoff_polo_2.0/1327037.html'
          )
          expect($('#text').text()).toBe(
            'Param found: shirts_and_tops, mens_ua_playoff_polo_2.0, 1327037.html'
          )
        })

        it('should work using browser', async () => {
          const browser = await next.browser(
            '/product/shirts_and_tops/mens_ua_playoff_polo_2.0/1327037.html'
          )
          expect(await browser.elementByCss('#text').text()).toBe(
            'Param found: shirts_and_tops, mens_ua_playoff_polo_2.0, 1327037.html'
          )
        })

        it('should work when navigating', async () => {
          const browser = await next.browser('/')
          await browser.elementByCss('#with-html').click()
          expect(await browser.waitForElementByCss('#text').text()).toBe(
            'Param found: shirts_and_tops, mens_ua_playoff_polo_2.0, 1327037.html'
          )
        })
      })

      describe('without .html extension', () => {
        it('should work when requesting the page directly', async () => {
          const $ = await next.render$(
            '/product/shirts_and_tops/mens_ua_playoff_polo_2.0/1327037'
          )
          expect($('#text').text()).toBe(
            'Param found: shirts_and_tops, mens_ua_playoff_polo_2.0, 1327037'
          )
        })

        it('should work using browser', async () => {
          const browser = await next.browser(
            '/product/shirts_and_tops/mens_ua_playoff_polo_2.0/1327037'
          )
          expect(await browser.elementByCss('#text').text()).toBe(
            'Param found: shirts_and_tops, mens_ua_playoff_polo_2.0, 1327037'
          )
        })

        it('should work when navigating', async () => {
          const browser = await next.browser('/')
          await browser.elementByCss('#without-html').click()
          expect(await browser.waitForElementByCss('#text').text()).toBe(
            'Param found: shirts_and_tops, mens_ua_playoff_polo_2.0, 1327037'
          )
        })
      })
    }
  )
}
