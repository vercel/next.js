import { join } from 'node:path'
import { runNextCodemod, useTempDir } from '../utils'

describe('next-codemod upgrade prompt', () => {
  it('should prompt user for release version if absent', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'no-dir-name'
      const cp = runNextCodemod(['upgrade'], { cwd })

      await new Promise<void>((resolve) => {
        cp.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          resolve()
        })

        let stdout = ''
        cp.stdout.on('data', (data) => {
          stdout += data.toString()
        })

        // enter project name
        cp.stdin.write(`${projectName}\n`)
        expect(stdout).toContain('Canary')
      })

      const pkg = require(join(cwd, projectName, 'package.json'))
      expect(pkg.name).toBe(projectName)
    })
  })
})
