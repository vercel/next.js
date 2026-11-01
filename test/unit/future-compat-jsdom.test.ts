import { spawnSync } from 'child_process'
import { gate } from 'next-test-utils'

describe('future-compat-jsdom', () => {
  it('initializes the JSDOM test environment unless punycode deprecations throw', async () => {
    // JSDOM loads before Jest registers tests, so suite gates cannot catch DEP0040.
    const result = spawnSync(
      process.execPath,
      [
        '--trace-deprecation',
        '--require',
        require.resolve('next/dist/server/require-hook'),
        '--eval',
        `
          const { JSDOM } = require(require.resolve('jsdom', {
            paths: [require.resolve('jest-environment-jsdom')],
          }))
          new JSDOM('').window.close()
          setImmediate(() => console.log('JSDOM initialized'))
        `,
      ],
      { encoding: 'utf8' }
    )

    expect(result.error).toBeUndefined()
    expect(result.signal).toBeNull()
    if (
      (await gate((conditions) => conditions.futureCompat)) &&
      Number(process.versions.node.split('.')[0]) >= 21
    ) {
      expect(result.status).toBe(1)
      expect(result.stdout).not.toContain('JSDOM initialized')
      expect(result.stderr).toContain(
        'DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.\n' +
          '    at node:punycode:'
      )
      expect(result.stderr).toContain("code: 'DEP0040'")
    } else {
      expect(result.status).toBe(0)
      expect(result.stdout).toContain('JSDOM initialized')
    }
  })
})
