/* eslint-env jest */

import { join } from 'path'
import {
  findPort,
  killApp,
  launchApp,
  nextBuild,
  nextStart,
} from 'next-test-utils'
import fetch from 'node-fetch'

const context = {}
const appDir = join(__dirname, '../')

describe('CLI usage', () => {
  describe('next dev', () => {
    beforeAll(async () => {
      context.appPort = await findPort()
      context.server = await launchApp(appDir, context.appPort)
    })
    afterAll(() => killApp(context.server))

    // only an IPv4 address should be accessible
    test('should default to ipv4', async () => {
      const { status } = await fetch(`http://127.0.0.1:${context.appPort}`)
      expect(status).toEqual(200)
      await expect(
        async () => await fetch(`http://[::1]:${context.appPort}`)
      ).rejects.toThrow(
        `request to http://[::1]:${context.appPort}/ failed, reason: connect ECONNREFUSED ::1:${context.appPort}`
      )
    })
  })

  describe('next start', () => {
    beforeAll(async () => {
      await nextBuild(appDir)
      context.appPort = await findPort()
      context.server = await nextStart(appDir, context.appPort)
    })
    afterAll(() => killApp(context.server))

    // only an IPv4 address should be accessible
    test('should default to ipv4', async () => {
      const { status } = await fetch(`http://127.0.0.1:${context.appPort}`)
      expect(status).toEqual(200)
      await expect(
        async () => await fetch(`http://[::1]:${context.appPort}`)
      ).rejects.toThrow(
        `request to http://[::1]:${context.appPort}/ failed, reason: connect ECONNREFUSED ::1:${context.appPort}`
      )
    })
  })
})
