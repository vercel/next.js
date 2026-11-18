import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

describe('eslint-config-next/oxlint', () => {
  it('runs Next.js rules with their Core Web Vitals severities', () => {
    const oxlint = join(
      dirname(require.resolve('oxlint/package.json')),
      'bin',
      'oxlint'
    )
    const cwd = mkdtempSync(join(__dirname, '.oxlint-'))

    function lint(file: string) {
      const { stdout, stderr, status, error } = spawnSync(
        process.execPath,
        [oxlint, '--config', 'oxlint.config.mjs', '--format', 'json', file],
        { cwd, encoding: 'utf8' }
      )

      if (error) {
        throw error
      }
      if (!stdout.trim().startsWith('{')) {
        throw new Error(`Oxlint did not return JSON:\n${stdout}\n${stderr}`)
      }

      return { status, diagnostics: JSON.parse(stdout).diagnostics }
    }

    try {
      writeFileSync(
        join(cwd, 'oxlint.config.mjs'),
        `import next from 'eslint-config-next/oxlint'
export default { extends: [next] }
`
      )
      writeFileSync(
        join(cwd, 'clean.jsx'),
        'export default function Page() { return <main /> }'
      )
      writeFileSync(
        join(cwd, 'violations.jsx'),
        `export default function Page() {
  return <><img src="/logo.png" alt="Logo" /><script src="/script.js" /></>
}
`
      )

      expect(lint('clean.jsx')).toEqual({ status: 0, diagnostics: [] })
      const violations = lint('violations.jsx')
      expect(violations.status).toBe(1)
      expect(violations.diagnostics).toHaveLength(2)
      expect(violations.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'next(no-img-element)',
            severity: 'warning',
          }),
          expect.objectContaining({
            code: 'next(no-sync-scripts)',
            severity: 'error',
          }),
        ])
      )
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})
