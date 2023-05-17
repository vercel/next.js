/* eslint-env jest */

import { join } from 'path'
import { renderViaHTTP, findPort, launchApp, killApp } from 'next-test-utils'

const context = {}

describe('App Dir Runtime', () => {
  beforeAll(async () => {
    context.appPort = await findPort()
    context.server = await launchApp(join(__dirname, '../'), context.appPort)
  })
  afterAll(() => {
    killApp(context.server)
  })

  describe('node.js runtime', () => {
    it('should be able to render routes with the node.js runtime', async () => {
      expect(await renderViaHTTP(context.appPort, '/api/node')).toMatch(
        JSON.stringify({
          msg: 'Hello node.js!',
          runtime: 'nodejs',
        })
      )
    })

    it('should be possible to access node.js module in routes using the node.js runtime', async () => {
      expect(await renderViaHTTP(context.appPort, '/api/node/crypto')).toMatch(
        /Hello crypto!/
      )
    })
  })

  describe('edge runtime', () => {
    it('should be able to render routes with the edge runtime', async () => {
      expect(await renderViaHTTP(context.appPort, '/api/edge')).toMatch(
        JSON.stringify({
          msg: 'Hello edge!',
          runtime: 'edge',
        })
      )
    })
  })
})
