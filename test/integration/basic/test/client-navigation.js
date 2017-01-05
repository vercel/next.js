/* global describe, it, expect */

import webdriver, { By, Until } from 'next-webdriver'

export default (context) => {
  describe('Client Navigation', () => {
    describe('with <Link/>', () => {
      it('should navigate the page', async () => {
        const driver = await webdriver(context.appPort, '/nav')

        await driver.findElement(By.tagName('a')).click()
        await driver.wait(Until.elementLocated(By.css('.nav-about')))

        const text = await driver.findElement(By.tagName('p')).getText()
        expect(text).toBe('This is the about page.')

        await driver.quit()
      })

      it('should navigate via the client side', async () => {
        const driver = await webdriver(context.appPort, '/nav')

        await driver.findElement(By.id('increase')).click()
        await driver.findElement(By.tagName('a')).click()
        await driver.wait(Until.elementLocated(By.css('.nav-about')))

        await driver.findElement(By.tagName('a')).click()
        await driver.wait(Until.elementLocated(By.css('.nav-home')))

        const counterText = await driver.findElement(By.id('counter')).getText()
        expect(counterText).toBe('Counter: 1')

        await driver.quit()
      })
    })

    describe('with <a/> tag inside the <Link />', () => {
      it('should navigate the page', async () => {
        const driver = await webdriver(context.appPort, '/nav/about')

        await driver.findElement(By.tagName('a')).click()
        await driver.wait(Until.elementLocated(By.css('.nav-home')))

        const text = await driver.findElement(By.tagName('p')).getText()
        expect(text).toBe('This is the home.')

        await driver.quit()
      })
    })
  })
}
