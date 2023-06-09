import stripAnsi from 'next/dist/compiled/strip-ansi'
import { createNext, FileRef } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { check, renderViaHTTP, shouldRunTurboDevTest } from 'next-test-utils'
import { join } from 'path'

const isTurbo = shouldRunTurboDevTest()

describe('api-route-errors cli output', () => {
  let next: NextInstance

  beforeAll(async () => {
    next = await createNext({
      files: {
        pages: new FileRef(join(__dirname, 'app/pages')),
      },
      dependencies: {},
    })
  })
  afterAll(() => next.destroy())

  test('error', async () => {
    const outputIndex = next.cliOutput.length
    await renderViaHTTP(next.url, '/api/error')
    await check(() => next.cliOutput.slice(outputIndex), /pages\/api/)

    const output = stripAnsi(next.cliOutput.slice(outputIndex))
    // Location
    if (!isTurbo) {
      expect(output).toContain('- error pages/api/error.js (2:8) @ error')
    }
    // Stack
    if (isTurbo) {
      expect(output).toContain('at error (pages/api/error.js:2:9)')
    } else {
      expect(output).toContain('pages/api/error.js:6:11')
    }
    // Source code
    expect(output).toContain('1 | export default function error(req, res) {')
  })

  test('uncaught exception', async () => {
    const outputIndex = next.cliOutput.length
    await renderViaHTTP(next.url, '/api/uncaught-exception')
    await check(() => next.cliOutput.slice(outputIndex), /pages\/api/)

    const output = stripAnsi(next.cliOutput.slice(outputIndex))
    // Location
    if (!isTurbo) {
      expect(output).toContain(
        '- error pages/api/uncaught-exception.js (3:10) @ Timeout'
      )
    }
    // Stack
    if (isTurbo) {
      expect(output).toContain(
        'at Timeout._onTimeout (pages/api/uncaught-exception.js:3:11)'
      )
    } else {
      expect(output).toContain('pages/api/uncaught-exception.js:7:15')
    }
    // Source code
    expect(output).toContain(
      '1 | export default function uncaughtException(req, res) {'
    )
  })

  test('unhandled rejection', async () => {
    const outputIndex = next.cliOutput.length
    await renderViaHTTP(next.url, '/api/unhandled-rejection')
    await check(() => next.cliOutput.slice(outputIndex), /pages\/api/)

    const output = stripAnsi(next.cliOutput.slice(outputIndex))
    // Location
    if (!isTurbo) {
      expect(output).toContain(
        '- error pages/api/unhandled-rejection.js (2:17) @ unhandledRejection'
      )
    }
    // Stack
    if (isTurbo) {
      expect(output).toContain(
        'at unhandledRejection (pages/api/unhandled-rejection.js:2:18)'
      )
    } else {
      expect(output).toContain('pages/api/unhandled-rejection.js:6:20')
    }
    // Source code
    expect(output).toContain(
      '1 | export default function unhandledRejection(req, res) '
    )
  })
})
