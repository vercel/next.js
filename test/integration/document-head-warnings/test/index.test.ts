/* eslint-env jest */

import { join } from 'path'
import { renderViaHTTP, findPort, launchApp, killApp } from 'next-test-utils'

const appDir = join(__dirname, '..')
let output

describe('Custom Document Head Warnings', () => {
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
  ;(process.env.TURBOPACK_BUILD ? describe.skip : describe)(
    'development mode',
    () => {
      it('warns when using a <title> in document/head', () => {
        expect(output).toMatch(
          /.*Warning: <title> should not be used in _document.js's <Head>\..*/
        )
      })

      it('warns when using viewport meta tags in document/head', () => {
        expect(output).toMatch(
          /.*Warning: viewport meta tags should not be used in _document.js's <Head>\..*/
        )
      })

      it('warns when using a crossOrigin attribute on document/head', () => {
        expect(output).toMatch(
          /.*Warning: `Head` attribute `crossOrigin` is deprecated\..*/
        )
      })
    }
  )
})
