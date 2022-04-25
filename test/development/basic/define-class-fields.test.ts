import { join } from 'path'
import webdriver from 'next-webdriver'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { check } from 'next-test-utils'

describe('useDefineForClassFields SWC option', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        'tsconfig.json': new FileRef(
          join(__dirname, 'define-class-fields/tsconfig.json')
        ),
        pages: new FileRef(join(__dirname, 'define-class-fields/pages')),
      },
      dependencies: {
        mobx: '6.3.7',
        typescript: '*',
        '@types/react': '*',
        '@types/node': '*',
        'mobx-react': '7.2.1',
      },
    })
  })

  afterAll(() => next.destroy())

  it('tsx should compile with useDefineForClassFields enabled', async () => {
    let browser
    try {
      browser = await webdriver(next.appPort, '/')
      await browser.elementByCss('#action').click()
      await check(
        () => browser.elementByCss('#name').text(),
        /this is my name: next/
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  it("Initializes resident to undefined after the call to 'super()' when with useDefineForClassFields enabled", async () => {
    let browser
    try {
      browser = await webdriver(next.appPort, '/animal')
      expect(await browser.elementByCss('#dog').text()).toBe('')
      expect(await browser.elementByCss('#dogDecl').text()).toBe('dog')
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })

  async function matchLogs$(browser) {
    let data_foundLog = false
    let name_foundLog = false

    const browserLogs = await browser.log('browser')

    browserLogs.forEach((log) => {
      if (log.message.includes('data changed')) {
        data_foundLog = true
      }
      if (log.message.includes('name changed')) {
        name_foundLog = true
      }
    })
    return [data_foundLog, name_foundLog]
  }

  it('set accessors from base classes won’t get triggered with useDefineForClassFields enabled', async () => {
    let browser
    try {
      browser = await webdriver(next.appPort, '/derived')
      await matchLogs$(browser).then(([data_foundLog, name_foundLog]) => {
        expect(data_foundLog).toBe(true)
        expect(name_foundLog).toBe(false)
      })
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  })
})
