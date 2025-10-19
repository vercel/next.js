import { nextTestSetup } from 'e2e-utils'
const { version: nextVersion } = require('next/package.json')

const cacheComponentsEnabled = process.env.__NEXT_CACHE_COMPONENTS === 'true'

describe('dev-output', () => {
  const { next, isTurbopack } = nextTestSetup({
    files: __dirname,
  })

  it('shows Cache Components indicator when enabled', async () => {
    const preamble = getPreambleOutput(next.cliOutput)

    if (cacheComponentsEnabled) {
      if (isTurbopack) {
        expect(preamble).toContain('Next.js')
        expect(preamble).toContain('Turbopack')
        expect(preamble).toContain('Cache Components')
      } else {
        expect(preamble).toContain('Next.js')
        expect(preamble).toContain('webpack')
        expect(preamble).toContain('Cache Components')
      }
    } else {
      // When cache components env is not set, should not show the indicator
      expect(preamble).toContain('Next.js')
      if (isTurbopack) {
        expect(preamble).toContain('Turbopack')
      } else {
        expect(preamble).toContain('webpack')
      }
      expect(preamble).not.toContain('Cache Components')
    }
  })
})

function getPreambleOutput(cliOutput: string): string {
  const lines: string[] = []

  for (const line of cliOutput.split('\n')) {
    // Capture lines up to and including the "Local:" line
    lines.push(line.replace(nextVersion, 'x.y.z'))

    if (line.includes('Local:')) {
      break
    }
  }

  return lines.join('\n').trim()
}
