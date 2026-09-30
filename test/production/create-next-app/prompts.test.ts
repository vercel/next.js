import { retry } from 'next-test-utils'
import { readFileSync } from 'fs'
import { join } from 'path'
import stripAnsi from 'strip-ansi'
import {
  createNextApp,
  projectFilesShouldExist,
  resolveNextTgzFilename,
  useTempDir,
} from './utils'

function expectTurbopackTailwindSetup(cwd: string, projectName: string) {
  const projectRoot = join(cwd, projectName)
  const pkg = require(join(projectRoot, 'package.json'))
  expect(pkg.devDependencies).toMatchObject({
    '@tailwindcss/turbopack': '^4',
    tailwindcss: '^4',
  })
  expect(pkg.devDependencies).not.toHaveProperty('@tailwindcss/postcss')
  expect(readFileSync(join(projectRoot, 'next.config.ts'), 'utf8')).toContain(
    'loaders: ["@tailwindcss/turbopack"]'
  )
}

describe('create-next-app prompts', () => {
  let nextTgzFilename: string

  beforeAll(() => {
    nextTgzFilename = resolveNextTgzFilename()
  })

  it.each([
    {
      flags: ['--typescript'],
      prompts: [
        'Which linter',
        'React Compiler',
        'Tailwind CSS',
        '`src/` directory',
        'App Router',
        'Cache Components',
        'customize the import alias',
        'include AGENTS.md',
        'help improve Next.js',
      ],
      typescript: true,
      reactCompiler: false,
    },
    {
      flags: [
        '--app',
        '--no-src-dir',
        '--no-eslint',
        '--import-alias',
        '@/*',
        '--react-compiler',
      ],
      prompts: [
        'TypeScript',
        'Tailwind CSS',
        'Cache Components',
        'include AGENTS.md',
        'help improve Next.js',
      ],
      typescript: false,
      reactCompiler: true,
    },
    {
      flags: [
        '--js',
        '--no-app',
        '--no-tailwind',
        '--no-linter',
        '--no-src-dir',
        '--no-react-compiler',
        '--no-import-alias',
        '--no-agents-md',
        '--no-agent-feedback',
      ],
      prompts: [],
      typescript: false,
      reactCompiler: false,
    },
  ])(
    'should prompt only for unspecified options with --interactive and $flags',
    async ({ flags, prompts, typescript, reactCompiler }) => {
      await useTempDir(async (cwd) => {
        const projectName = 'interactive-flags'
        const childProcess = createNextApp(
          [
            projectName,
            ...flags,
            '--interactive',
            '--skip-install',
            '--disable-git',
          ],
          { cwd },
          nextTgzFilename
        )
        const exited = new Promise((resolve) => {
          childProcess.on('close', resolve)
        })
        let output = ''
        childProcess.stdout.on('data', (chunk) => {
          output += stripAnsi(chunk.toString())
        })

        try {
          for (const prompt of prompts) {
            await retry(async () => {
              expect(output).toContain(prompt)
            })
            childProcess.stdin.write(
              prompt === 'Which linter'
                ? '\u001b[B\u001b[B\n'
                : prompt === 'App Router'
                  ? '\n'
                  : '\u001b[D\n'
            )
          }
          expect(await exited).toBe(0)
          expect(output).not.toContain('recommended Next.js defaults')
          expect(output).not.toContain('Using defaults for unprovided options')
          expect(output.includes('Would you like to use TypeScript?')).toBe(
            !typescript && flags.includes('--app')
          )
          const pkg = JSON.parse(
            readFileSync(join(cwd, projectName, 'package.json'), 'utf8')
          )
          expect(Boolean(pkg.devDependencies.typescript)).toBe(typescript)
          expect(Boolean(pkg.devDependencies.tailwindcss)).toBe(false)
          expect(
            Boolean(pkg.devDependencies['babel-plugin-react-compiler'])
          ).toBe(reactCompiler)
          expect(pkg.devDependencies.eslint).toBeUndefined()
          projectFilesShouldExist({
            cwd,
            projectName,
            files: [
              typescript ? 'tsconfig.json' : 'jsconfig.json',
              flags.includes('--no-app') ? 'pages' : 'app',
            ],
          })
        } finally {
          childProcess.kill()
          await exited
        }
      })
    }
  )

  it('should prompt directly with only --interactive', async () => {
    await useTempDir(async (cwd) => {
      const childProcess = createNextApp(
        ['interactive-only', '--interactive'],
        { cwd },
        nextTgzFilename
      )
      const exited = new Promise((resolve) => {
        childProcess.on('close', resolve)
      })
      let output = ''
      childProcess.stdout.on('data', (chunk) => {
        output += stripAnsi(chunk.toString())
      })
      try {
        await retry(async () => {
          expect(output).toContain('Would you like to use TypeScript?')
        })
        expect(output).not.toContain('recommended Next.js defaults')
        childProcess.stdin.write('\u0003')
        expect(await exited).toBe(1)
      } finally {
        childProcess.kill()
        await exited
      }
    })
  })

  it('should prompt user for choice if directory name is absent', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'no-dir-name'
      const childProcess = createNextApp(
        [
          '--ts',
          '--app',
          '--eslint',
          '--no-src-dir',
          '--no-tailwind',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
        ],
        {
          cwd,
        },
        nextTgzFilename
      )

      await new Promise<void>((resolve) => {
        childProcess.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          projectFilesShouldExist({
            cwd,
            projectName,
            files: ['package.json'],
          })
          resolve()
        })

        // enter project name
        childProcess.stdin.write(`${projectName}\n`)
      })

      const pkg = require(join(cwd, projectName, 'package.json'))
      expect(pkg.name).toBe(projectName)
    })
  })

  it('should use default for --ts when other flags are provided', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'ts-js'
      const childProcess = createNextApp(
        [
          projectName,
          '--app',
          '--eslint',
          '--no-tailwind',
          '--no-src-dir',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
        ],
        {
          cwd,
        },
        nextTgzFilename
      )

      // No stdin interaction needed - defaults are used automatically
      await new Promise<void>((resolve) => {
        childProcess.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          // Default is TypeScript
          projectFilesShouldExist({
            cwd,
            projectName,
            files: ['tsconfig.json'],
          })
          resolve()
        })
      })
    })
  })

  it('should use default for --tailwind when other flags are provided', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'tw'
      const childProcess = createNextApp(
        [
          projectName,
          '--ts',
          '--app',
          '--eslint',
          '--no-src-dir',
          '--no-import-alias',
          '--no-react-compiler',
          '--no-agents-md',
        ],
        {
          cwd,
        },
        nextTgzFilename
      )

      // No stdin interaction needed - defaults are used automatically
      await new Promise<void>((resolve) => {
        childProcess.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          // Default is Tailwind enabled
          projectFilesShouldExist({
            cwd,
            projectName,
            files: ['next.config.ts'],
          })
          resolve()
        })
      })

      expectTurbopackTailwindSetup(cwd, projectName)
      expect(
        readFileSync(join(cwd, projectName, 'next.config.ts'), 'utf8')
      ).toContain('cacheComponents: true')
    })
  })

  it('should use default import alias when other flags are provided', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'import-alias'
      const childProcess = createNextApp(
        [
          projectName,
          '--ts',
          '--app',
          '--eslint',
          '--no-tailwind',
          '--no-src-dir',
          '--no-react-compiler',
          '--no-agents-md',
        ],
        {
          cwd,
        },
        nextTgzFilename
      )

      // No stdin interaction needed - default import alias @/* is used
      await new Promise<void>((resolve) => {
        childProcess.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          resolve()
        })
      })

      const tsConfig = require(join(cwd, projectName, 'tsconfig.json'))
      expect(tsConfig.compilerOptions.paths).toMatchInlineSnapshot(`
        {
          "@/*": [
            "./*",
          ],
        }
      `)
    })
  })

  it('should not prompt user for choice and use defaults if --yes is defined', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'yes-we-can'
      const childProcess = createNextApp(
        [projectName, '--yes'],
        {
          cwd,
        },
        nextTgzFilename
      )

      await new Promise<void>((resolve) => {
        childProcess.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          projectFilesShouldExist({
            cwd,
            projectName,
            files: [
              'app',
              'package.json',
              'next.config.ts',
              'tsconfig.json',
              'AGENTS.md',
            ],
          })
          resolve()
        })
      })

      const pkg = require(join(cwd, projectName, 'package.json'))
      expect(pkg.name).toBe(projectName)
      expectTurbopackTailwindSetup(cwd, projectName)
      const tsConfig = require(join(cwd, projectName, 'tsconfig.json'))
      expect(tsConfig.compilerOptions.paths).toMatchInlineSnapshot(`
        {
          "@/*": [
            "./*",
          ],
        }
      `)
      expect(
        readFileSync(join(cwd, projectName, 'next.config.ts'), 'utf8')
      ).not.toContain('agentFeedback')
      expect(
        readFileSync(join(cwd, projectName, 'next.config.ts'), 'utf8')
      ).toContain('cacheComponents: true')
    })
  })

  it('should use recommended defaults when user selects that option', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'recommended-defaults'
      const childProcess = createNextApp(
        [projectName],
        {
          cwd,
        },
        nextTgzFilename
      )

      await new Promise<void>((resolve) => {
        let output = ''
        childProcess.stdout.on('data', (data) => {
          output += data
          process.stdout.write(data)
        })

        childProcess.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          expect(output).toContain('Agent feedback')
          expect(output).not.toMatch(/agents prepare anonymized feedback/)
          projectFilesShouldExist({
            cwd,
            projectName,
            files: [
              'app',
              'package.json',
              'next.config.ts', // tailwind
              'tsconfig.json', // typescript
              'AGENTS.md', // agent instructions
            ],
          })
          resolve()
        })

        // Select "Yes, use recommended defaults" (default option, just press enter)
        childProcess.stdin.write('\n')
      })

      const pkg = require(join(cwd, projectName, 'package.json'))
      expect(pkg.name).toBe(projectName)
      expectTurbopackTailwindSetup(cwd, projectName)
      expect(
        readFileSync(join(cwd, projectName, 'next.config.ts'), 'utf8')
      ).toContain('\n  experimental: {\n    agentFeedback: true,\n  },\n')
      expect(
        readFileSync(join(cwd, projectName, 'next.config.ts'), 'utf8')
      ).toContain('cacheComponents: true')
    })
  })

  it.each([
    { saved: undefined, reuse: false, enabled: true },
    { saved: false, reuse: false, enabled: false },
    { saved: false, reuse: true, enabled: false },
  ])(
    'should default Cache Components to $enabled with saved=$saved and reuse=$reuse',
    async ({ saved, reuse, enabled }) => {
      const Conf = require('next/dist/compiled/conf')

      await useTempDir(async (cwd) => {
        const conf = new Conf({ projectName: 'create-next-app' })
        conf.clear()
        if (saved !== undefined) {
          conf.set('preferences', { cacheComponents: saved })
        }

        const projectName = 'cache-components-prompt'
        const childProcess = createNextApp(
          [projectName],
          { cwd },
          nextTgzFilename,
          false
        )
        const exited = new Promise((resolve) => {
          childProcess.on('exit', resolve)
        })
        let output = ''
        childProcess.stdout.on('data', (data) => {
          output += data
        })

        const answer = async (prompt: string, input = '\n') => {
          await retry(async () => {
            expect(stripAnsi(output)).toContain(prompt)
          })
          childProcess.stdin.write(input)
        }

        // Saved preferences add a reuse option before the customize option.
        const selection = saved !== undefined && !reuse ? 2 : 1
        await answer(
          'Would you like to use the recommended Next.js defaults?',
          '\u001b[B'.repeat(selection) + '\n'
        )
        if (!reuse) {
          for (const prompt of [
            'Would you like to use TypeScript?',
            'Which linter would you like to use?',
            'Would you like to use React Compiler?',
            'Would you like to use Tailwind CSS?',
            'Would you like your code inside a',
            'Would you like to use App Router?',
            'Would you like to use Cache Components?',
            'Would you like to customize the import alias',
            'Would you like to include AGENTS.md',
          ]) {
            await answer(prompt)
          }
        }
        await answer('Would you like to help improve Next.js')
        expect(await exited).toBe(0)

        const config = readFileSync(
          join(cwd, projectName, 'next.config.ts'),
          'utf8'
        )
        if (enabled) {
          expect(config).toContain('cacheComponents: true')
          expect(config).toContain('partialPrefetching: true')
        } else {
          expect(config).not.toContain('cacheComponents:')
          expect(config).not.toContain('partialPrefetching:')
        }
      })
    }
  )

  it('should show reuse previous settings option when preferences exist', async () => {
    const Conf = require('next/dist/compiled/conf')

    await useTempDir(async (cwd) => {
      // Manually set preferences to simulate a previous run
      const conf = new Conf({ projectName: 'create-next-app' })
      conf.set('preferences', {
        typescript: false,
        eslint: true,
        linter: 'eslint',
        tailwind: false,
        app: false,
        srcDir: false,
        importAlias: '@/*',
        customizeImportAlias: false,
        reactCompiler: false,
      })

      const projectName = 'reuse-prefs-project'
      const childProcess = createNextApp(
        [projectName],
        {
          cwd,
        },
        nextTgzFilename,
        false // Don't clear preferences
      )

      await new Promise<void>(async (resolve) => {
        let output = ''
        childProcess.stdout.on('data', (data) => {
          output += data
          process.stdout.write(data)
        })

        // Select "reuse previous settings" (cursor down once, then enter)
        childProcess.stdin.write('\u001b[B\n')

        await retry(async () => {
          expect(output).toMatch(/No, reuse previous settings/)
        })

        await retry(async () => {
          expect(output).toMatch(/agents prepare anonymized feedback/)
        })
        // Accept the default "Yes" for agent feedback.
        childProcess.stdin.write('\n')

        childProcess.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          projectFilesShouldExist({
            cwd,
            projectName,
            files: [
              'pages', // pages router (not app)
              'package.json',
              'jsconfig.json', // javascript
            ],
          })
          resolve()
        })
      })

      const pkg = require(join(cwd, projectName, 'package.json'))
      expect(pkg.name).toBe(projectName)
    })
  })

  it('should prompt user to confirm reset preferences', async () => {
    await useTempDir(async (cwd) => {
      const childProcess = createNextApp(
        ['--reset'],
        {
          cwd,
        },
        nextTgzFilename
      )

      await new Promise<void>(async (resolve) => {
        childProcess.on('exit', async (exitCode) => {
          expect(exitCode).toBe(0)
          resolve()
        })
        let output = ''
        childProcess.stdout.on('data', (data) => {
          output += data
          process.stdout.write(data)
        })
        await retry(async () => {
          expect(output).toMatch(
            /Would you like to reset the saved preferences/
          )
        })
        // cursor forward, choose 'Yes' for reset preferences
        childProcess.stdin.write('\u001b[C\n')
        await retry(async () => {
          expect(output).toMatch(/The preferences have been reset successfully/)
        })
      })
    })
  })
})
