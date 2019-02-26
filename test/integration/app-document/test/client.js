/* eslint-env jest */
/* global browser */
import { join } from 'path'
import { check } from 'next-test-utils'
import fsTimeMachine from 'fs-time-machine'
import { getElementText } from 'puppet-utils'

export default (context, render) => {
  afterEach(() => fsTimeMachine.restore())

  describe('Client side', () => {
    it('should detect the changes to pages/_app.js and display it', async () => {
      const page = await browser.newPage()
      const _app = await fsTimeMachine(join(__dirname, '../pages/_app.js'))

      await page.goto(context.server.getURL('/'))
      expect(await getElementText(page, '#hello-hmr')).toBe('Hello HMR')

      // Change content
      await _app.replace('Hello HMR', 'Hi HMR')
      await check(
        () => getElementText(page, 'body'),
        /Hi HMR/
      )

      // Restore content
      await _app.restore()
      await check(
        () => getElementText(page, 'body'),
        /Hello HMR/
      )
      await page.close()
    })

    it('should detect the changes to pages/_document.js and display it', async () => {
      const page = await browser.newPage()
      const _document = await fsTimeMachine(join(__dirname, '../pages/_document.js'))

      await page.goto(context.server.getURL('/'))
      expect(await getElementText(page, '#hello-hmr')).toBe('Hello HMR')

      // Change content
      await _document.replace('Hello Document HMR', 'Hi Document HMR')
      await check(
        () => getElementText(page, 'body'),
        /Hi Document HMR/
      )

      // Restore content
      await _document.restore()
      await check(
        () => getElementText(page, 'body'),
        /Hello Document HMR/
      )
      await page.close()
    })

    it('should keep state between page navigations', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL('/'))

      const randomNumber = await getElementText(page, '#random-number')
      await expect(page).toClick('#about-link')
      expect(await getElementText(page, '#random-number')).toBe(randomNumber)
      await page.close()
    })

    it('It should share module state with pages', async () => {
      const page = await browser.newPage()
      await page.goto(context.server.getURL('/shared'))
      expect(await getElementText(page, '#currentstate')).toBe('UPDATED CLIENT')
      await page.close()
    })
  })
}
