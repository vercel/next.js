import { join } from 'path'
import { nextTestSetup } from 'e2e-utils'
import { check } from 'next-test-utils'

describe('useDefineForClassFields SWC option', () => {
  const { next } = nextTestSetup({
    files: join(__dirname, 'fixture'),
    dependencies: {
      mobx: '6.3.7',
      typescript: 'latest',
      '@types/react': 'latest',
      '@types/node': 'latest',
      'mobx-react': '7.2.1',
    },
  })

  it('tsx should compile with useDefineForClassFields enabled', async () => {
    const browser = await next.browser('/')
    await browser.elementByCss('#action').click()
    await check(
      () => browser.elementByCss('#name').text(),
      /this is my name: next/
    )
  })

  it("Initializes resident to undefined after the call to 'super()' when with useDefineForClassFields enabled", async () => {
    const browser = await next.browser('/animal')
    expect(await browser.elementByCss('#dog').text()).toBe('undefined')
    expect(await browser.elementByCss('#dogDecl').text()).toBe('dog')
  })

  async function matchLogs$(browser) {
    let data_foundLog = false
    let name_foundLog = false

    const browserLogs = await browser.log()

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
    const browser = await next.browser('/derived')
    await matchLogs$(browser).then(([data_foundLog, name_foundLog]) => {
      expect(data_foundLog).toBe(true)
      expect(name_foundLog).toBe(false)
    })
  })
})
