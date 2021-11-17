/* eslint-env jest */

import { join } from 'path'
import fs from 'fs'
import webdriver from 'next-webdriver'
import {
  fetchViaHTTP,
  findPort,
  killApp,
  launchApp,
  waitFor,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)
const context = {}
context.appDir = join(__dirname, '../')

describe('HMR with middleware', () => {
  let output = ''

  beforeAll(async () => {
    context.appPort = await findPort()
    context.app = await launchApp(context.appDir, context.appPort, {
      onStdout(msg) {
        output += msg
      },
      onStderr(msg) {
        output += msg
      },
    })
  })
  afterAll(() => killApp(context.app))

  it('works for pages when middleware is compiled', async () => {
    const browser = await webdriver(context.appPort, `/`)

    try {
      await browser.eval('window.itdidnotrefresh = "hello"')
      await fetchViaHTTP(context.appPort, `/about`)
      await waitFor(1000)

      expect(output.includes('about/_middleware')).toEqual(true)
      expect(await browser.eval('window.itdidnotrefresh')).toBe('hello')
    } finally {
      await browser.close()
    }
  })

  it('refreshes the page when middleware changes ', async () => {
    const browser = await webdriver(context.appPort, `/about`)
    await browser.eval('window.didrefresh = "hello"')
    const text = await browser.elementByCss('h1').text()
    expect(text).toEqual('AboutA')

    const middlewarePath = join(context.appDir, '/pages/about/_middleware.js')
    const originalContent = fs.readFileSync(middlewarePath, 'utf-8')
    const editedContent = originalContent.replace('/about/a', '/about/b')

    try {
      fs.writeFileSync(middlewarePath, editedContent)
      await waitFor(1000)
      const textb = await browser.elementByCss('h1').text()
      expect(await browser.eval('window.itdidnotrefresh')).not.toBe('hello')
      expect(textb).toEqual('AboutB')
    } finally {
      fs.writeFileSync(middlewarePath, originalContent)
      await browser.close()
    }
  })
})
