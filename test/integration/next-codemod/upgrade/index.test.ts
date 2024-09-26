import { join } from 'node:path'
import { run as createApp, runNextCodemod, useTempDir } from '../utils'

describe('next-codemod upgrade', () => {
  it('should upgrade to canary', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'jiwon'
      const app = await createApp([projectName, '--yes', '--empty'], 'latest', {
        cwd,
      })
      expect(app.exitCode).toBe(0)

      const upgrade = await runNextCodemod([
        'upgrade',
        'canary',
        '--cwd',
        `${cwd}/${projectName}`,
      ])
      expect(upgrade.exitCode).toBe(0)

      const pkg = require(join(cwd, projectName, 'package.json'))
      expect(pkg.dependencies.next).toContain('canary')
    })
  })
})
