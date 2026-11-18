import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { load } from 'js-yaml'
import { join } from 'path'
import { resolveNextTgzFilename, run, useTempDir } from './utils'

const testPkgPaths = [
  ['next', '/packed/next.tgz'],
  ['eslint-config-next', '/packed/eslint-config-next.tgz'],
  ['@next/env', 'C:\\packed\\next-env.tgz'],
  ['@next/eslint-plugin-next', '/packed/eslint-plugin-next.tgz'],
  // Packed, but not a dependency of the generated project. Yarn Classic
  // resolves every `resolutions` entry, so these must not be overridden.
  ['@next/mdx', '/packed/next-mdx.tgz'],
  ['next-rspack', '/packed/next-rspack.tgz'],
]
const transitiveTestPkgOverrides = {
  '@next/env': 'C:\\packed\\next-env.tgz',
  '@next/eslint-plugin-next': '/packed/eslint-plugin-next.tgz',
}
const eslintProjectArgs = [
  '--ts',
  '--eslint',
  '--no-tailwind',
  '--no-src-dir',
  '--no-react-compiler',
  '--no-agents-md',
  '--app',
  '--no-import-alias',
  '--skip-install',
  '--disable-git',
]

async function readProjectJson(projectDir: string) {
  return JSON.parse(await readFile(join(projectDir, 'package.json'), 'utf8'))
}

async function readWorkspaceYaml(projectDir: string) {
  return load(
    await readFile(join(projectDir, 'pnpm-workspace.yaml'), 'utf8')
  ) as Record<string, unknown>
}

describe('create-next-app ESLint configuration', () => {
  let nextTgzFilename: string

  beforeAll(() => {
    nextTgzFilename = resolveNextTgzFilename()
  })

  it('should generate eslint.config.mjs for TypeScript project with ESLint', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-eslint-ts'
      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--eslint',
          '--no-tailwind',
          '--no-src-dir',
          '--no-react-compiler',
          '--no-agents-md',
          '--app',
          '--no-import-alias',
          '--skip-install',
        ],
        nextTgzFilename,
        { cwd }
      )

      expect(exitCode).toBe(0)

      const projectDir = join(cwd, projectName)

      // Should have eslint.config.mjs
      expect(existsSync(join(projectDir, 'eslint.config.mjs'))).toBe(true)

      // Should NOT have biome.json
      expect(existsSync(join(projectDir, 'biome.json'))).toBe(false)

      // Check eslint.config.mjs content
      const eslintConfig = await readFile(
        join(projectDir, 'eslint.config.mjs'),
        'utf8'
      )
      expect(eslintConfig).toContain('next/core-web-vitals')
      expect(eslintConfig).toContain('next/typescript')

      // Check package.json scripts
      const packageJson = JSON.parse(
        await readFile(join(projectDir, 'package.json'), 'utf8')
      )
      expect(packageJson.scripts.lint).toBe('eslint')
      expect(packageJson.devDependencies.eslint).toBe('^10')
      expect(packageJson.devDependencies['eslint-config-next']).toBeTruthy()
    })
  })

  it('should generate eslint.config.mjs for JavaScript project with ESLint', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-eslint-js'
      const { exitCode } = await run(
        [
          projectName,
          '--js',
          '--eslint',
          '--no-tailwind',
          '--no-src-dir',
          '--no-react-compiler',
          '--no-agents-md',
          '--app',
          '--no-import-alias',
          '--skip-install',
        ],
        nextTgzFilename,
        { cwd }
      )

      expect(exitCode).toBe(0)

      const projectDir = join(cwd, projectName)

      // Should have eslint.config.mjs
      expect(existsSync(join(projectDir, 'eslint.config.mjs'))).toBe(true)

      // Check eslint.config.mjs content for JS project
      const eslintConfig = await readFile(
        join(projectDir, 'eslint.config.mjs'),
        'utf8'
      )
      expect(eslintConfig).toContain('next/core-web-vitals')
      expect(eslintConfig).not.toContain('next/typescript')

      // Check package.json scripts
      const packageJson = JSON.parse(
        await readFile(join(projectDir, 'package.json'), 'utf8')
      )
      expect(packageJson.scripts.lint).toBe('eslint')
      expect(packageJson.devDependencies.eslint).toBe('^10')
      expect(packageJson.devDependencies['eslint-config-next']).toBeTruthy()
    })
  })

  it.each([
    ['npm', 'npm/11.11.0 node/v24.14.1'],
    ['yarn', 'yarn/1.22.19 npm/? node/v24.14.1'],
    ['bun', 'bun/1.3.4 npm/? node/v24.14.1'],
  ])(
    'should override packed transitive dependencies for %s',
    async (_packageManager, userAgent) => {
      await useTempDir(async (cwd) => {
        const projectName = 'test-overrides'
        const { exitCode } = await run(
          [projectName, ...eslintProjectArgs],
          resolveNextTgzFilename(),
          {
            cwd,
            env: {
              NEXT_TEST_PKG_PATHS: JSON.stringify(testPkgPaths),
              npm_config_user_agent: userAgent,
            },
          }
        )

        expect(exitCode).toBe(0)
        const projectDir = join(cwd, projectName)
        const packageJson = await readProjectJson(projectDir)
        expect(packageJson.overrides).toEqual(transitiveTestPkgOverrides)
        expect(packageJson.resolutions).toEqual(transitiveTestPkgOverrides)
        expect(packageJson.pnpm).toBeUndefined()
        expect(packageJson.overrides).not.toHaveProperty('next')
        expect(packageJson.overrides).not.toHaveProperty('eslint-config-next')
      })
    }
  )

  it('should use package.json pnpm overrides for pnpm v9', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-pnpm-v9-overrides'
      const { exitCode } = await run(
        [projectName, ...eslintProjectArgs],
        resolveNextTgzFilename(),
        {
          cwd,
          env: {
            NEXT_TEST_PKG_PATHS: JSON.stringify(testPkgPaths),
            npm_config_user_agent: 'pnpm/9.15.9 npm/? node/v24.14.1',
          },
        }
      )

      expect(exitCode).toBe(0)
      const projectDir = join(cwd, projectName)
      const packageJson = await readProjectJson(projectDir)
      expect(packageJson.pnpm).toEqual({
        overrides: transitiveTestPkgOverrides,
      })
      expect(existsSync(join(projectDir, 'pnpm-workspace.yaml'))).toBe(false)
    })
  })

  it.each([
    ['10', 'pnpm/10.33.0 npm/? node/v24.14.1', 'ignoredBuiltDependencies'],
    ['11', 'pnpm/11.0.0 npm/? node/v24.14.1', 'allowBuilds'],
  ])(
    'should write workspace overrides for pnpm v%s',
    async (_version, userAgent, buildSetting) => {
      await useTempDir(async (cwd) => {
        const projectName = 'test-pnpm-workspace-overrides'
        const { exitCode } = await run(
          [projectName, ...eslintProjectArgs],
          resolveNextTgzFilename(),
          {
            cwd,
            env: {
              NEXT_TEST_PKG_PATHS: JSON.stringify(testPkgPaths),
              npm_config_user_agent: userAgent,
            },
          }
        )

        expect(exitCode).toBe(0)
        const projectDir = join(cwd, projectName)
        const workspace = await readWorkspaceYaml(projectDir)
        expect(workspace).toHaveProperty(buildSetting)
        expect(workspace.overrides).toEqual(transitiveTestPkgOverrides)
        expect((await readProjectJson(projectDir)).pnpm).toBeUndefined()
      })
    }
  )

  it('should only override companions of direct dependencies', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-biome-overrides'
      const { exitCode } = await run(
        [
          projectName,
          ...eslintProjectArgs.filter((arg) => arg !== '--eslint'),
          '--biome',
        ],
        resolveNextTgzFilename(),
        {
          cwd,
          env: {
            NEXT_TEST_PKG_PATHS: JSON.stringify(testPkgPaths),
            npm_config_user_agent: 'yarn/1.22.19 npm/? node/v24.14.1',
          },
        }
      )

      expect(exitCode).toBe(0)
      const packageJson = await readProjectJson(join(cwd, projectName))
      const envOnly = { '@next/env': 'C:\\packed\\next-env.tgz' }
      expect(packageJson.overrides).toEqual(envOnly)
      expect(packageJson.resolutions).toEqual(envOnly)
    })
  })

  it('should not write test overrides without packed package paths', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'test-no-overrides'
      const { exitCode } = await run(
        [projectName, ...eslintProjectArgs],
        resolveNextTgzFilename(),
        {
          cwd,
          env: {
            NEXT_TEST_PKG_PATHS: undefined,
            npm_config_user_agent: 'pnpm/10.33.0 npm/? node/v24.14.1',
          },
        }
      )

      expect(exitCode).toBe(0)
      const projectDir = join(cwd, projectName)
      const packageJson = await readProjectJson(projectDir)
      expect(packageJson.overrides).toBeUndefined()
      expect(packageJson.resolutions).toBeUndefined()
      expect(packageJson.pnpm).toBeUndefined()
      expect(await readWorkspaceYaml(projectDir)).not.toHaveProperty(
        'overrides'
      )
    })
  })
})
