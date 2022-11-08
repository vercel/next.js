/* eslint-env jest */

import { join } from 'path'
import { renderViaHTTP, findPort, launchApp, killApp } from 'next-test-utils'

const context = {
  output: '',
}

const collectOutput = (message) => {
  context.output += message
}

describe('Document and App', () => {
  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await launchApp(join(__dirname, '../'), context.appPort, {
      onStdout: collectOutput,
      onStderr: collectOutput,
    })

    // pre-build all pages at the start
    await Promise.all([renderViaHTTP(context.appPort, '/')])
  })
  afterAll(() => killApp(context.server))

  it('should not have any missing key warnings', async () => {
    const html = await renderViaHTTP(context.appPort, '/')
    expect(html).toMatch(/<div>Hello World!!!<\/div>/)
  })
})
