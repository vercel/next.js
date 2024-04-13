import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { run, useTempDir } from './utils'

describe('create-next-app', () => {
  it('should not create if the target directory is not empty', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'non-empty-dir'
      await mkdir(join(cwd, projectName))
      const pkg = join(cwd, projectName, 'package.json')
      await writeFile(pkg, `{ "name": "${projectName}" }`)

      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--no-eslint',
          '--no-tailwind',
          '--no-src-dir',
          '--no-import-alias',
        ],
        {
          cwd,
          reject: false,
        }
      )
      expect(res.exitCode).toBe(1)
      expect(res.stdout).toMatch(/contains files that could conflict/)
    })
  })

  it('should not create if the target directory is not writable', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'dir-not-writable'

      // if the folder isn't able to be write restricted we can't test so skip
      if (
        await writeFile(join(cwd, 'test'), 'hello')
          .then(() => true)
          .catch(() => false)
      ) {
        console.warn(
          `Test folder is not write restricted skipping write permission test`
        )
        return
      }
      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--eslint',
          '--no-tailwind',
          '--no-src-dir',
          '--no-import-alias',
        ],
        {
          cwd,
          reject: false,
        }
      )

      expect(res.stderr).toMatch(
        /you do not have write permissions for this folder/
      )
      expect(res.exitCode).toBe(1)
    }, 0o500)
  })
})
