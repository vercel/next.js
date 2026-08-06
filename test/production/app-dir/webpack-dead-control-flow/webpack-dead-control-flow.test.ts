import fs from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

const DEAD_MARKER = 'WEBPACK_DEAD_CONTROL_FLOW_DEAD_MARKER'
const LIVE_MARKER = 'WEBPACK_DEAD_CONTROL_FLOW_LIVE_MARKER'

function collectStaticJavaScript(staticDir: string): string {
  const files = fs
    .readdirSync(staticDir, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry.endsWith('.js'))

  expect(files.length).toBeGreaterThan(0)

  return files
    .map((file) => fs.readFileSync(path.join(staticDir, file), 'utf8'))
    .join('\n')
}

describe('webpack-dead-control-flow', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  ;(isTurbopack ? describe.skip : describe)('webpack chunk output', () => {
    let staticJavaScript: string

    beforeAll(() => {
      staticJavaScript = collectStaticJavaScript(
        path.join(next.testDir, '.next/static')
      )
    })

    it('does not emit a chunk for an unreachable dynamic import', () => {
      expect(staticJavaScript.includes(DEAD_MARKER)).toBe(false)
    })

    it('still emits a chunk for a reachable dynamic import', () => {
      expect(staticJavaScript.includes(LIVE_MARKER)).toBe(true)
    })
  })
})
