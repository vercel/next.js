/* eslint-env jest */

import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  nextBuild,
  killApp,
} from 'next-test-utils'

jest.setTimeout(1000 * 60 * 2)

const appDir = join(__dirname, '..')
let appPort
let app
let output

const handleOutput = (msg) => {
  output += msg
}

describe('TypeScript Image Component', () => {
  describe('next build', () => {
    it('should fail to build with the valid Image usage', async () => {
      const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
      expect(stderr).toMatch(/boom/)
      expect(code).toBe(1)
    })
  })

  describe('next dev', () => {
    beforeAll(async () => {
      output = ''
      appPort = await findPort()
      app = await launchApp(appDir, appPort, {
        onStdout: handleOutput,
        onStderr: handleOutput,
      })
    })
    afterAll(() => killApp(app))

    it('should render the valid Image usage', async () => {
      const html = await renderViaHTTP(appPort, '/valid', {})
      expect(html).toMatch(/This is valid usage for the Image component/)
    })

    it('should show error when invalid Image usage', async () => {
      await renderViaHTTP(appPort, '/invalid', {})
      expect(output).toMatch(
        /must use width and height attributes or unsized attribute/
      )
    })
  })
})
