/* eslint-env jest */

import { join } from 'path'
import {
  renderViaHTTP,
  fetchViaHTTP,
  findPort,
  launchApp,
  killApp,
} from 'next-test-utils'

// test suits
import rendering from './rendering'
import client from './client'
import csp from './csp'

const context = {
  output: '',
}
jest.setTimeout(1000 * 60 * 5)

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
    await renderViaHTTP(context.appPort, '/')
    expect(context.output).not.toMatch(
      /Each child in a list should have a unique "key" prop/
    )
  })

  rendering(
    context,
    'Rendering via HTTP',
    (p, q) => renderViaHTTP(context.appPort, p, q),
    (p, q) => fetchViaHTTP(context.appPort, p, q)
  )
  client(context, (p, q) => renderViaHTTP(context.appPort, p, q))
  csp(context, (p, q) => renderViaHTTP(context.appPort, p, q))
})
