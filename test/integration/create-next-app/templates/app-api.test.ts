import { join } from 'node:path'
import { tryNextDev, run, useTempDir, projectFilesShouldExist } from '../utils'
import { mapSrcFiles, projectSpecification } from '../lib/specification'
import { projectDepsShouldBe } from '../lib/utils'

function shouldBeApiTemplateProject({
  cwd,
  projectName,
  mode,
  srcDir,
}: {
  cwd: string
  projectName: string
  mode: 'js' | 'ts'
  srcDir?: boolean
}) {
  const template = 'app-api'

  projectFilesShouldExist({
    cwd,
    projectName,
    files: mapSrcFiles(projectSpecification[template][mode].files, srcDir),
  })

  projectDepsShouldBe({
    type: 'dependencies',
    cwd,
    projectName,
    deps: mapSrcFiles(projectSpecification[template][mode].deps, srcDir),
  })

  projectDepsShouldBe({
    type: 'devDependencies',
    cwd,
    projectName,
    deps: mapSrcFiles(projectSpecification[template][mode].devDeps, srcDir),
  })
}

describe('create-next-app --api (Headless App)', () => {
  let nextTgzFilename: string

  beforeAll(() => {
    if (!process.env.NEXT_TEST_PKG_PATHS) {
      throw new Error('This test needs to be run with `node run-tests.js`.')
    }

    const pkgPaths = new Map<string, string>(
      JSON.parse(process.env.NEXT_TEST_PKG_PATHS)
    )

    nextTgzFilename = pkgPaths.get('next')!
  })

  it('should create JavaScript project with --js flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'app-js'
      const { exitCode } = await run(
        [
          projectName,
          '--js',
          '--api',
          '--no-turbo',
          '--no-src-dir',
          '--no-import-alias',
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )

      expect(exitCode).toBe(0)
      shouldBeApiTemplateProject({
        cwd,
        projectName,
        mode: 'js',
      })
      await tryNextDev({
        cwd,
        isApi: true,
        projectName,
      })
    })
  })

  it('should create TypeScript project with --ts flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'app-ts'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--api',
          '--no-turbo',
          '--no-src-dir',
          '--no-import-alias',
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )

      expect(exitCode).toBe(0)
      shouldBeApiTemplateProject({
        cwd,
        projectName,
        mode: 'ts',
      })
      await tryNextDev({ cwd, isApi: true, projectName })
    })
  })

  it('should create project inside "src" directory with --src-dir flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'app-src-dir'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--api',
          '--no-turbo',
          '--src-dir',
          '--no-import-alias',
        ],
        nextTgzFilename,
        {
          cwd,
          stdio: 'inherit',
        }
      )

      expect(exitCode).toBe(0)
      shouldBeApiTemplateProject({
        cwd,
        projectName,
        mode: 'ts',
        srcDir: true,
      })
      await tryNextDev({
        cwd,
        isApi: true,
        projectName,
      })
    })
  })

  it('should enable turbopack dev with --turbo flag', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'app-turbo'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--api',
          '--turbo',
          '--no-src-dir',
          '--no-import-alias',
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )

      expect(exitCode).toBe(0)
      const projectRoot = join(cwd, projectName)
      const pkgJson = require(join(projectRoot, 'package.json'))
      expect(pkgJson.scripts.dev).toBe('next dev --turbo')

      await tryNextDev({
        cwd,
        isApi: true,
        projectName,
      })
    })
  })
})
