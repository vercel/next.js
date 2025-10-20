import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { run, useTempDir, projectFilesShouldExist } from './utils'

describe('create-next-app MCP configuration', () => {
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

  it('should create .mcp.json with default configuration when using --yes', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'mcp-default'

      const { exitCode } = await run(
        [projectName, '--yes', '--skip-install'],
        nextTgzFilename,
        {
          cwd,
        }
      )

      expect(exitCode).toBe(0)

      projectFilesShouldExist({
        cwd,
        projectName,
        files: ['.mcp.json', 'package.json'],
      })

      const mcpConfigPath = join(cwd, projectName, '.mcp.json')
      expect(existsSync(mcpConfigPath)).toBe(true)

      const mcpConfig = JSON.parse(readFileSync(mcpConfigPath, 'utf8'))
      expect(mcpConfig).toMatchObject({
        mcpServers: {
          'next-devtools': {
            command: 'npx',
            args: ['-y', 'next-devtools-mcp@latest'],
          },
        },
      })
    })
  })

  it('should not create .mcp.json when --no-mcp is specified', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'no-mcp'

      const { exitCode } = await run(
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
          '--no-mcp',
          '--skip-install',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )

      expect(exitCode).toBe(0)

      projectFilesShouldExist({
        cwd,
        projectName,
        files: ['package.json'],
      })

      const mcpConfigPath = join(cwd, projectName, '.mcp.json')
      expect(existsSync(mcpConfigPath)).toBe(false)
    })
  })

  it('should create .mcp.json with all other options', async () => {
    await useTempDir(async (cwd) => {
      const projectName = 'mcp-with-options'

      const { exitCode } = await run(
        [
          projectName,
          '--ts',
          '--app',
          '--tailwind',
          '--eslint',
          '--no-turbopack',
          '--src-dir',
          '--import-alias',
          '@/custom/*',
          '--react-compiler',
          '--mcp',
          '--skip-install',
          ...(process.env.NEXT_RSPACK ? ['--rspack'] : []),
        ],
        nextTgzFilename,
        {
          cwd,
        }
      )

      expect(exitCode).toBe(0)

      projectFilesShouldExist({
        cwd,
        projectName,
        files: ['.mcp.json', 'package.json', 'tsconfig.json', 'src'],
      })

      const mcpConfigPath = join(cwd, projectName, '.mcp.json')
      expect(existsSync(mcpConfigPath)).toBe(true)

      const mcpConfig = JSON.parse(readFileSync(mcpConfigPath, 'utf8'))
      expect(mcpConfig).toMatchObject({
        mcpServers: {
          'next-devtools': {
            command: 'npx',
            args: ['-y', 'next-devtools-mcp@latest'],
          },
        },
      })
    })
  })
})
