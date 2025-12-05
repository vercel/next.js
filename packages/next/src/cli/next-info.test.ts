import { nextInfo, NextInfoOptions } from './next-info'
import os from 'os'

// Mock dependencies
jest.mock('child_process')
jest.mock('../lib/picocolors', () => ({
  bold: (str: string) => str,
  cyan: (str: string) => str,
  yellow: (str: string) => str,
}))
jest.mock('../server/config', () => jest.fn())
jest.mock('../lib/helpers/get-registry', () => ({
  getRegistry: jest.fn(() => 'https://registry.npmjs.org'),
}))
jest.mock('../server/dev/parse-version-info', () => ({
  parseVersionInfo: jest.fn(),
}))
jest.mock('../next-devtools/shared/version-staleness', () => ({
  getStaleness: jest.fn(() => ({ title: '' })),
}))
jest.mock('../build/output/log', () => ({
  warn: jest.fn(),
}))

import childProcess from 'child_process'
import loadConfig from '../server/config'

describe('next-info', () => {
  let consoleLogSpy: jest.SpyInstance
  let consoleWarnSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation()

    // Mock loadConfig
    ;(loadConfig as jest.Mock).mockResolvedValue({
      output: 'standalone',
      experimental: {
        useWasmBinary: false,
      },
    })

    // Mock require for package versions
    jest.spyOn(global, 'require').mockImplementation((moduleName: string) => {
      if (moduleName.endsWith('/package.json')) {
        if (moduleName.includes('next/package.json')) {
          return { version: '14.0.0' }
        }
        if (moduleName.includes('react/package.json')) {
          return { version: '18.2.0' }
        }
        if (moduleName.includes('react-dom/package.json')) {
          return { version: '18.2.0' }
        }
        if (moduleName.includes('typescript/package.json')) {
          return { version: '5.0.0' }
        }
        if (moduleName.includes('eslint-config-next/package.json')) {
          return { version: '14.0.0' }
        }
        throw new Error('Module not found')
      }
      return jest.requireActual(moduleName)
    })

    // Mock child process exec functions
    ;(childProcess.execFileSync as jest.Mock) = jest
      .fn()
      .mockImplementation((cmd: string) => {
        if (cmd === 'npm') return Buffer.from('10.2.0')
        if (cmd === 'yarn') return Buffer.from('1.22.0')
        if (cmd === 'pnpm') return Buffer.from('8.0.0')
        throw new Error('Command not found')
      })
    ;(childProcess.execSync as jest.Mock) = jest
      .fn()
      .mockImplementation((cmd: string) => {
        if (cmd.includes('npm')) return Buffer.from('10.2.0')
        if (cmd.includes('yarn')) return Buffer.from('1.22.0')
        if (cmd.includes('pnpm')) return Buffer.from('8.0.0')
        throw new Error('Command not found')
      })

    // Mock fetch
    global.fetch = jest.fn().mockResolvedValue({
      json: jest.fn().mockResolvedValue({
        latest: '14.0.0',
        canary: '14.0.1-canary.0',
      }),
    }) as any
  })

  afterEach(() => {
    consoleLogSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    jest.restoreAllMocks()
  })

  describe('nextInfo', () => {
    it('should print basic info when verbose is false', async () => {
      const options: NextInfoOptions = {
        verbose: false,
      }

      await nextInfo(options)

      expect(consoleLogSpy).toHaveBeenCalled()
      const output = consoleLogSpy.mock.calls.join('\n')
      expect(output).toContain('Operating System:')
      expect(output).toContain('Platform:')
      expect(output).toContain('Binaries:')
      expect(output).toContain('Node:')
      expect(output).toContain('Relevant Packages:')
      expect(output).toContain('next:')
      expect(output).toContain("Next.js Config:")
    })

    it('should display package versions', async () => {
      await nextInfo({ verbose: false })

      const output = consoleLogSpy.mock.calls.join('\n')
      expect(output).toContain('next: 14.0.0')
      expect(output).toContain('react: 18.2.0')
      expect(output).toContain('react-dom: 18.2.0')
      expect(output).toContain('typescript: 5.0.0')
    })

    it('should display binary versions', async () => {
      await nextInfo({ verbose: false })

      const output = consoleLogSpy.mock.calls.join('\n')
      expect(output).toContain('npm: 10.2.0')
      expect(output).toContain('yarn: 1.22.0')
      expect(output).toContain('pnpm: 8.0.0')
    })

    it('should display system information', async () => {
      await nextInfo({ verbose: false })

      const output = consoleLogSpy.mock.calls.join('\n')
      expect(output).toContain(`Platform: ${os.platform()}`)
      expect(output).toContain(`Arch: ${os.arch()}`)
      expect(output).toContain('Available memory (MB):')
      expect(output).toContain('Available CPU cores:')
    })

    it('should display Next.js config', async () => {
      await nextInfo({ verbose: false })

      const output = consoleLogSpy.mock.calls.join('\n')
      expect(output).toContain('output: standalone')
    })

    it('should handle missing packages gracefully', async () => {
      ;(global.require as jest.Mock).mockImplementation((moduleName: string) => {
        if (moduleName.includes('typescript/package.json')) {
          throw new Error('Module not found')
        }
        if (moduleName.endsWith('/package.json')) {
          return { version: '1.0.0' }
        }
        return jest.requireActual(moduleName)
      })

      await nextInfo({ verbose: false })

      const output = consoleLogSpy.mock.calls.join('\n')
      expect(output).toContain('typescript: N/A')
    })

    it('should handle missing binaries gracefully', async () => {
      ;(childProcess.execFileSync as jest.Mock) = jest
        .fn()
        .mockImplementation(() => {
          throw new Error('Command not found')
        })
      ;(childProcess.execSync as jest.Mock) = jest
        .fn()
        .mockImplementation(() => {
          throw new Error('Command not found')
        })

      await nextInfo({ verbose: false })

      const output = consoleLogSpy.mock.calls.join('\n')
      expect(output).toContain('npm: N/A')
      expect(output).toContain('yarn: N/A')
      expect(output).toContain('pnpm: N/A')
    })

    it('should handle fetch errors gracefully', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'))

      await nextInfo({ verbose: false })

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch latest canary version')
      )
    })

    it('should show next-rspack version when NEXT_RSPACK is set', async () => {
      process.env.NEXT_RSPACK = '1'
      ;(global.require as jest.Mock).mockImplementation((moduleName: string) => {
        if (moduleName.includes('next-rspack/package.json')) {
          return { version: '1.0.0' }
        }
        if (moduleName.endsWith('/package.json')) {
          return { version: '14.0.0' }
        }
        return jest.requireActual(moduleName)
      })

      await nextInfo({ verbose: false })

      const output = consoleLogSpy.mock.calls.join('\n')
      expect(output).toContain('next-rspack: 1.0.0')

      delete process.env.NEXT_RSPACK
    })

    it('should display Node.js version', async () => {
      await nextInfo({ verbose: false })

      const output = consoleLogSpy.mock.calls.join('\n')
      expect(output).toContain(`Node: ${process.versions.node}`)
    })

    it('should load config from current working directory', async () => {
      await nextInfo({ verbose: false })

      expect(loadConfig).toHaveBeenCalledWith('phase-info', process.cwd())
    })
  })

  describe('CPU cores detection', () => {
    it('should display CPU cores count when available', async () => {
      jest.spyOn(os, 'cpus').mockReturnValue(
        Array(8).fill({
          model: 'test',
          speed: 2400,
          times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 },
        })
      )

      await nextInfo({ verbose: false })

      const output = consoleLogSpy.mock.calls.join('\n')
      expect(output).toContain('Available CPU cores: 8')
    })

    it('should handle case when CPU cores cannot be determined', async () => {
      jest.spyOn(os, 'cpus').mockReturnValue([])

      await nextInfo({ verbose: false })

      const output = consoleLogSpy.mock.calls.join('\n')
      expect(output).toContain('Available CPU cores: N/A')
    })
  })
})
