import { execFile, type ExecFileException } from 'node:child_process'
import { mkdtemp, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

it.each([
  ['SIGINT', 130],
  ['SIGTERM', 143],
  ['SIGHUP', 129],
] as const)(
  'keeps %s cancellation under parent ownership until artifacts and browser cleanup complete',
  async (signal, code) => {
    const outputDir = await mkdtemp(join(tmpdir(), 'next-browser-signal-'))
    const result = await promisify(execFile)(
      process.execPath,
      [
        '--import',
        require.resolve('tsx'),
        join(__dirname, 'browser-signals.ts'),
        signal,
        join(__dirname, '../../..'),
        outputDir,
      ],
      { timeout: 15_000 }
    ).then(
      (output) => ({ ...output, code: 0, signal: null }),
      (error: ExecFileException & { stdout: string; stderr: string }) => {
        if (error.killed || typeof error.code !== 'number') throw error
        return {
          stdout: error.stdout,
          stderr: error.stderr,
          code: error.code,
          signal: error.signal,
        }
      }
    )
    expect(result.stderr).toBe('')
    expect(result.code).toBe(code)
    expect(result.signal).toBeNull()
    const report = JSON.parse(result.stdout.trim())
    expect(report.phases).toEqual([
      'ready',
      'signal-received',
      'browser-still-usable',
      'artifacts-captured',
      'host-disposed',
    ])
    expect(report.attachments.map((attachment) => attachment.kind)).toEqual([
      'screenshot',
      'trace',
    ])
    for (const attachment of report.attachments) {
      expect((await stat(attachment.path)).size).toBeGreaterThan(0)
    }
  },
  20_000
)
