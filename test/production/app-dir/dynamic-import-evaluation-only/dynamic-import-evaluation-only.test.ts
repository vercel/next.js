import { nextTestSetup } from 'e2e-utils'
import fs from 'fs'
import path from 'path'

// This suite controls the local build lifecycle directly, which deployment tests cannot reproduce.
// @force-gate !deploy
describe('dynamic-import-evaluation-only', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    skipStart: true,
  })

  it('should drop only the side-effect-free targets of evaluation-only dynamic imports', async () => {
    const { exitCode, cliOutput } = await next.build()

    expect(cliOutput).not.toContain('ModuleId not found for ident')
    expect(exitCode).toBe(0)

    const dir = path.join(next.testDir, '.next/server')
    const output = fs
      .readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.js'))
      .map((file) => fs.readFileSync(path.join(dir, file), 'utf8'))
      .join('\n')

    expect(output).not.toContain('DROPPED_SIMPLE')
    expect(output).not.toContain('DROPPED_PATTERN')
    expect(output).toContain('__kept')
  })
})
