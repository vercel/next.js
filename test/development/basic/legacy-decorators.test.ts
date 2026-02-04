import { join } from 'path'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('Legacy decorators SWC option', () => {
  describe('with extended tsconfig', () => {
    let next: NextInstance

    beforeAll(async () => {
      next = await createNext({
        files: {
          'tsconfig.json': new FileRef(
            join(__dirname, 'legacy-decorators/tsconfig-extended.json')
          ),
          'tsconfig-base.json': new FileRef(
            join(__dirname, 'legacy-decorators/jsconfig.json')
          ),
          pages: new FileRef(join(__dirname, 'legacy-decorators/pages')),
        },
        dependencies: {
          mobx: '6.3.7',
          'mobx-react': '7.2.1',
        },
      })
    })
    afterAll(() => next.destroy())

    it('should compile with legacy decorators enabled from extended config', async () => {
      let browser
      try {
        browser = await webdriver(next.url, '/')
        const text = await browser.elementByCss('#count').text()
        expect(text).toBe('Current number: 0')
        await browser.elementByCss('#increase').click()
        await check(
          () => browser.elementByCss('#count').text(),
          /Current number: 1/
        )
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })

  describe('with base config', () => {
    let next: NextInstance
    beforeAll(async () => {
      next = await createNext({
        files: {
          'jsconfig.json': new FileRef(
            join(__dirname, 'legacy-decorators/jsconfig.json')
          ),
          pages: new FileRef(join(__dirname, 'legacy-decorators/pages')),
        },
        dependencies: {
          mobx: '6.3.7',
          'mobx-react': '7.2.1',
        },
      })
    })
    afterAll(() => next.destroy())

    it('should compile with legacy decorators enabled', async () => {
      let browser
      try {
        browser = await webdriver(next.url, '/')
        const text = await browser.elementByCss('#count').text()
        expect(text).toBe('Current number: 0')
        await browser.elementByCss('#increase').click()
        await check(
          () => browser.elementByCss('#count').text(),
          /Current number: 1/
        )
      } finally {
        if (browser) {
          await browser.close()
        }
      }
    })
  })
})
