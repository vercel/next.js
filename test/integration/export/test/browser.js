/* eslint-env jest */
/* global browser */
import { check } from 'next-test-utils'
import { getElementText } from 'puppet-utils'

export default function (context) {
  describe('Render via browser', () => {
    it('should render the home page', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL('/'))
      await expect(page).toMatchElement('#home-page p', { text: 'This is the home page' })
      await page.close()
    })

    it('should do navigations via Link', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL('/'))
      await expect(page).toClick('#about-via-link')
      await page.waitFor('#about-page')
      await expect(page).toMatchElement('#about-page p', { text: 'This is the About page foo' })
      await page.close()
    })

    it('should do navigations via Router', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL('/'))
      await expect(page).toClick('#about-via-router')
      await page.waitFor('#about-page')
      await expect(page).toMatchElement('#about-page p', { text: 'This is the About page foo' })
      await page.close()
    })

    it('should do run client side javascript', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL('/'))
      await expect(page).toClick('#counter')
      await page.waitFor('#counter-page')
      await expect(page).toClick('#counter-increase')
      await expect(page).toClick('#counter-increase')
      await expect(page).toMatchElement('#counter-page p', { text: 'Counter: 2' })
      await page.close()
    })

    it('should render pages using getInitialProps', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL('/'))
      await expect(page).toClick('#get-initial-props')
      await page.waitFor('#dynamic-page')
      await expect(page).toMatchElement('#dynamic-page p', { text: 'cool dynamic text' })
      await page.close()
    })

    it('should render dynamic pages with custom urls', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL('/'))
      await expect(page).toClick('#dynamic-1')
      await page.waitFor('#dynamic-page')
      await expect(page).toMatchElement('#dynamic-page p', { text: 'next export is nice' })
      await page.close()
    })

    it('should support client side naviagtion', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL('/'))
      await expect(page).toClick('#counter')
      await page.waitFor('#counter-page')
      await expect(page).toClick('#counter-increase')
      await expect(page).toClick('#counter-increase')
      await expect(page).toMatchElement('#counter-page p', { text: 'Counter: 2' })

      // let's go back and come again to this page:
      await expect(page).toClick('#go-back')
      await page.waitFor('#home-page')
      await expect(page).toClick('#counter')
      await page.waitFor('#counter-page')
      await expect(page).toMatchElement('#counter-page p', { text: 'Counter: 2' })
      await page.close()
    })

    it('should render dynamic import components in the client', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL('/'))
      await expect(page).toClick('#dynamic-imports-page')
      await page.waitFor('#dynamic-imports-page')
      await check(
        () => getElementText(page, '#dynamic-imports-page p'),
        /Welcome to dynamic imports/
      )
      await page.close()
    })

    it('should render pages with url hash correctly', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL('/'))
      await expect(page).toClick('#with-hash')
      await page.waitFor('#dynamic-page')
      await expect(page).toMatchElement('#dynamic-page p', { text: 'zeit is awesome' })

      await check(
        () => getElementText(page, '#hash'),
        /cool/
      )
      await page.close()
    })

    it('should navigate even if used a button inside <Link />', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL('/button-link'))
      await expect(page).toClick('button')
      await page.waitFor('#home-page')
      await expect(page).toMatchElement('#home-page p', { text: 'This is the home page' })
      await page.close()
    })

    describe('pages in the nested level: level1', () => {
      it('should render the home page', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/'))
        await expect(page).toClick('#level1-home-page')
        await check(() => getElementText(page, 'body'), /This is the Level1 home page/)
        await page.close()
      })

      it('should render the about page', async () => {
        const page = await browser.newPage()
        await page.goto(context.server.getURL('/'))
        await expect(page).toClick('#level1-about-page')
        await check(() => getElementText(page, 'body'), /This is the Level1 about page/)
        await page.close()
      })
    })
  })
}
