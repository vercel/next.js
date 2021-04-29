/* eslint-env jest */

import { join } from 'path'
import {
  renderViaHTTP,
  findPort,
  launchApp,
  killApp,
  nextBuild,
} from 'next-test-utils'
import { CUSTOM_DOCUMENT_RSC_ERROR } from 'next/dist/lib/constants'

jest.setTimeout(1000 * 60)
const appDir = join(__dirname, '..')

describe('Concurrent Document Component Errors', () => {
  it('should error when exporting a class component', async () => {
    const { stderr } = await nextBuild(appDir, [], { stderr: true })
    expect(stderr).toContain(CUSTOM_DOCUMENT_RSC_ERROR)
  })

  describe('development mode', () => {
    let output

    beforeAll(async () => {
      const handleOutput = (msg) => {
        output += msg
      }
      const appPort = await findPort()
      const app = await launchApp(appDir, appPort, {
        onStdout: handleOutput,
        onStderr: handleOutput,
      })
      await renderViaHTTP(appPort, '/')
      await killApp(app)
    })

    it('errors when document is a class component', () => {
      expect(output).toContain(CUSTOM_DOCUMENT_RSC_ERROR)
    })
  })
})
