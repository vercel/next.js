import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { run, useTempDir } from './utils'

describe('create-next-app ESLint configuration', () => {
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
          '--app',
          '--no-turbopack',
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
      expect(packageJson.devDependencies.eslint).toBeTruthy()
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
          '--app',
          '--no-turbopack',
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
      expect(packageJson.devDependencies.eslint).toBeTruthy()
      expect(packageJson.devDependencies['eslint-config-next']).toBeTruthy()
    })
  })
})
