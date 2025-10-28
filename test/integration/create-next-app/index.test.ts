import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  run,
  useTempDir,
  projectFilesShouldExist,
  projectFilesShouldNotExist,
} from './utils'

describe('create-next-app', () => {
  let nextTgzFilename: string

  beforeAll(() => {
    if (!process.env.NEXT_TEST_PKG_PATHS) {
      throw new Error('This test needs to be run with `node run-tests.js`.')
    }

    const pkgPaths = new Map<string, string>(
      JSON.parse(process.env.NEXT_TEST_PKG_PATHS)
    )

    nextTgzFilename = pkgPaths.get('next')
  })

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
          '--no-turbopack',
          '--no-linter',
          '--no-tailwind',
          '--no-src-dir',
          '--no-import-alias',
          '--no-react-compiler',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
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
    const expectedErrorMessage =
      /you do not have write permissions for this folder|EPERM: operation not permitted/

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
          '--no-turbopack',
          '--eslint',
          '--no-tailwind',
          '--no-src-dir',
          '--no-import-alias',
          '--no-react-compiler',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
        {
          cwd,
          reject: false,
        }
      )

      expect(res.stderr).toMatch(expectedErrorMessage)
      expect(res.exitCode).toBe(1)
    }, 0o500).catch((err) => {
      if (!expectedErrorMessage.test(err.message)) {
        throw err
      }
    })
  })
  it('should not install dependencies if --skip-install', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'empty-dir'

      const res = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--no-turbopack',
          '--no-linter',
          '--no-tailwind',
          '--no-src-dir',
          '--no-import-alias',
          '--skip-install',
          '--no-react-compiler',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )
      expect(res.exitCode).toBe(0)
      projectFilesShouldExist({
        cwd,
        projectName,
        files: ['.gitignore', 'package.json'],
      })
      projectFilesShouldNotExist({ cwd, projectName, files: ['node_modules'] })
    })
  })
})
