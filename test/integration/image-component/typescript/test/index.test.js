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
    it('should fail to build invalid usage of the Image component', async () => {
      const { stderr, code } = await nextBuild(appDir, [], { stderr: true })
      expect(stderr).toMatch(/Failed to compile/)
      expect(stderr).toMatch(/is not assignable to type/)
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

    it('should render the valid Image usage and not print error', async () => {
      const html = await renderViaHTTP(appPort, '/valid', {})
      expect(html).toMatch(/This is valid usage of the Image component/)
      expect(output).not.toMatch(/Error: Image/)
    })

    it('should print error when invalid Image usage', async () => {
      await renderViaHTTP(appPort, '/invalid', {})
      expect(output).toMatch(
        /must use "width" and "height" properties or "layout='fill'" property/
      )
    })
  })
})
