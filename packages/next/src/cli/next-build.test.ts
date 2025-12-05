import { nextBuild, NextBuildOptions } from './next-build'
import { Bundler } from '../lib/bundler'

// Mock dependencies
jest.mock('fs', () => ({
  existsSync: jest.fn(),
}))

jest.mock('../build', () => jest.fn().mockResolvedValue(undefined))

jest.mock('../build/output/log', () => ({
  warn: jest.fn(),
}))

jest.mock('../server/lib/utils', () => ({
  printAndExit: jest.fn((message: string, code?: number) => {
    throw new Error(`printAndExit: ${message} (code: ${code})`)
  }),
}))

jest.mock('../lib/get-project-dir', () => ({
  getProjectDir: jest.fn((dir?: string) => dir || '/mock/project'),
}))

jest.mock('../lib/memory/startup', () => ({
  enableMemoryDebuggingMode: jest.fn(),
}))

jest.mock('../lib/memory/shutdown', () => ({
  disableMemoryDebuggingMode: jest.fn(),
}))

jest.mock('../lib/bundler', () => ({
  Bundler: {
    Webpack: 'webpack',
    Turbopack: 'turbopack',
  },
  parseBundlerArgs: jest.fn((options: any) => {
    if (options.turbopack || options.turbo) return 'turbopack'
    if (options.webpack) return 'webpack'
    return 'webpack'
  }),
}))

jest.mock('../lib/resolve-build-paths', () => ({
  resolveBuildPaths: jest.fn(),
  parseBuildPathsInput: jest.fn(),
}))

jest.mock('../lib/picocolors', () => ({
  italic: (str: string) => str,
}))

import { existsSync } from 'fs'
import build from '../build'
import { warn } from '../build/output/log'
import { printAndExit } from '../server/lib/utils'
import { getProjectDir } from '../lib/get-project-dir'
import { enableMemoryDebuggingMode } from '../lib/memory/startup'
import { disableMemoryDebuggingMode } from '../lib/memory/shutdown'
import { parseBundlerArgs } from '../lib/bundler'
import {
  resolveBuildPaths,
  parseBuildPathsInput,
} from '../lib/resolve-build-paths'

describe('next-build', () => {
  let processExitSpy: jest.SpyInstance
  let sigintHandler: NodeJS.SignalsListener
  let sigtermHandler: NodeJS.SignalsListener

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock process.exit
    processExitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never)

    // Capture signal handlers
    jest.spyOn(process, 'on').mockImplementation((event: any, handler: any) => {
      if (event === 'SIGINT') sigintHandler = handler
      if (event === 'SIGTERM') sigtermHandler = handler
      return process
    })

    // Mock existsSync to return true by default
    ;(existsSync as jest.Mock).mockReturnValue(true)
  })

  afterEach(() => {
    processExitSpy.mockRestore()
    delete process.env.EXPERIMENTAL_DEBUG_MEMORY_USAGE
    delete process.env.NEXT_TRACE_UPLOAD_DISABLED
  })

  describe('basic functionality', () => {
    it('should build with default options', async () => {
      const options: NextBuildOptions = {
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      }

      await nextBuild(options)

      expect(getProjectDir).toHaveBeenCalledWith(undefined)
      expect(build).toHaveBeenCalledWith(
        '/mock/project',
        undefined, // experimentalAnalyze
        undefined, // profile
        false, // debug
        undefined, // debugPrerender
        false, // no mangling
        undefined, // experimentalAppOnly
        'webpack',
        'default',
        undefined, // traceUploadUrl
        undefined, // resolvedAppPaths
        undefined // resolvedPagePaths
      )
    })

    it('should build with custom directory', async () => {
      const options: NextBuildOptions = {
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      }

      await nextBuild(options, '/custom/path')

      expect(getProjectDir).toHaveBeenCalledWith('/custom/path')
      expect(build).toHaveBeenCalledWith(
        '/custom/path',
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      )
    })

    it('should exit if directory does not exist', async () => {
      ;(existsSync as jest.Mock).mockReturnValue(false)

      const options: NextBuildOptions = {
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      }

      await expect(nextBuild(options, '/nonexistent')).rejects.toThrow(
        'printAndExit: > No such directory exists as the project root: /nonexistent'
      )

      expect(build).not.toHaveBeenCalled()
    })
  })

  describe('bundler selection', () => {
    it('should use turbopack when --turbopack flag is set', async () => {
      const options: NextBuildOptions = {
        turbopack: true,
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      }

      await nextBuild(options)

      expect(parseBundlerArgs).toHaveBeenCalledWith(options)
      expect(build).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'turbopack',
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      )
    })

    it('should reject --experimental-analyze with webpack', async () => {
      ;(parseBundlerArgs as jest.Mock).mockReturnValue('webpack')

      const options: NextBuildOptions = {
        experimentalAnalyze: true,
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      }

      await expect(nextBuild(options)).rejects.toThrow(
        'printAndExit: --experimental-analyze is only compatible with the Turbopack bundler'
      )
    })

    it('should allow --experimental-analyze with turbopack', async () => {
      ;(parseBundlerArgs as jest.Mock).mockReturnValue('turbopack')

      const options: NextBuildOptions = {
        experimentalAnalyze: true,
        turbopack: true,
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      }

      await nextBuild(options)

      expect(build).toHaveBeenCalledWith(
        expect.anything(),
        true, // experimentalAnalyze
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'turbopack',
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      )
    })
  })

  describe('warning messages', () => {
    it('should warn when mangling is disabled', async () => {
      const options: NextBuildOptions = {
        mangling: false,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      }

      await nextBuild(options)

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Mangling is disabled')
      )
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('This may affect performance')
      )
    })

    it('should warn when profiling is enabled', async () => {
      const options: NextBuildOptions = {
        profile: true,
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      }

      await nextBuild(options)

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Profiling is enabled')
      )
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('This may affect performance')
      )
    })

    it('should warn when debug prerender is enabled', async () => {
      const options: NextBuildOptions = {
        debugPrerender: true,
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      }

      await nextBuild(options)

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Prerendering is running in debug mode')
      )
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('should not be used for production')
      )
    })
  })

  describe('debug and profiling options', () => {
    it('should enable debug mode with --debug flag', async () => {
      const options: NextBuildOptions = {
        debug: true,
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      }

      await nextBuild(options)

      expect(build).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        true, // debug
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      )
    })

    it('should enable debug mode with NEXT_DEBUG_BUILD env var', async () => {
      process.env.NEXT_DEBUG_BUILD = '1'

      const options: NextBuildOptions = {
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      }

      await nextBuild(options)

      expect(build).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        true, // debug
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      )

      delete process.env.NEXT_DEBUG_BUILD
    })

    it('should enable profiling with --profile flag', async () => {
      const options: NextBuildOptions = {
        profile: true,
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      }

      await nextBuild(options)

      expect(build).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        true, // profile
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      )
    })
  })

  describe('memory debugging', () => {
    it('should enable memory debugging mode when flag is set', async () => {
      const options: NextBuildOptions = {
        experimentalDebugMemoryUsage: true,
        mangling: true,
        experimentalBuildMode: 'default',
      }

      await nextBuild(options)

      expect(process.env.EXPERIMENTAL_DEBUG_MEMORY_USAGE).toBe('1')
      expect(enableMemoryDebuggingMode).toHaveBeenCalled()
    })

    it('should disable memory debugging mode on build error', async () => {
      const buildError = new Error('Build failed')
      ;(buildError as any).code = 'WEBPACK_ERRORS'
      ;(build as jest.Mock).mockRejectedValue(buildError)

      const options: NextBuildOptions = {
        experimentalDebugMemoryUsage: true,
        mangling: true,
        experimentalBuildMode: 'default',
      }

      await expect(nextBuild(options)).rejects.toThrow()

      expect(disableMemoryDebuggingMode).toHaveBeenCalled()
    })
  })

  describe('trace upload', () => {
    it('should set trace upload URL when provided', async () => {
      const options: NextBuildOptions = {
        experimentalUploadTrace: 'https://example.com/trace',
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      }

      await nextBuild(options)

      expect(build).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'https://example.com/trace',
        expect.anything(),
        expect.anything()
      )
    })

    it('should not set trace upload URL when disabled', async () => {
      process.env.NEXT_TRACE_UPLOAD_DISABLED = '1'

      const options: NextBuildOptions = {
        experimentalUploadTrace: 'https://example.com/trace',
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      }

      await nextBuild(options)

      expect(build).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        undefined, // traceUploadUrl should be undefined
        expect.anything(),
        expect.anything()
      )
    })
  })

  describe('signal handlers', () => {
    it('should register SIGINT handler', async () => {
      const options: NextBuildOptions = {
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      }

      await nextBuild(options)

      expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function))

      // Trigger SIGINT
      sigintHandler('SIGINT')
      expect(processExitSpy).toHaveBeenCalledWith(130)
    })

    it('should register SIGTERM handler', async () => {
      const options: NextBuildOptions = {
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      }

      await nextBuild(options)

      expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function))

      // Trigger SIGTERM
      sigtermHandler('SIGTERM')
      expect(processExitSpy).toHaveBeenCalledWith(143)
    })
  })

  describe('build modes', () => {
    it('should support compile build mode', async () => {
      const options: NextBuildOptions = {
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'compile',
      }

      await nextBuild(options)

      expect(build).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'compile',
        expect.anything(),
        expect.anything(),
        expect.anything()
      )
    })

    it('should support generate build mode', async () => {
      const options: NextBuildOptions = {
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'generate',
      }

      await nextBuild(options)

      expect(build).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'generate',
        expect.anything(),
        expect.anything(),
        expect.anything()
      )
    })
  })

  describe('error handling', () => {
    it('should handle WEBPACK_ERRORS gracefully', async () => {
      const error = new Error('Webpack compilation failed')
      ;(error as any).code = 'WEBPACK_ERRORS'
      ;(build as jest.Mock).mockRejectedValue(error)

      const options: NextBuildOptions = {
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      }

      await expect(nextBuild(options)).rejects.toThrow(
        'printAndExit: > Webpack compilation failed'
      )
    })

    it('should handle BUILD_OPTIMIZATION_FAILED gracefully', async () => {
      const error = new Error('Build optimization failed')
      ;(error as any).code = 'BUILD_OPTIMIZATION_FAILED'
      ;(build as jest.Mock).mockRejectedValue(error)

      const options: NextBuildOptions = {
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      }

      await expect(nextBuild(options)).rejects.toThrow(
        'printAndExit: > Build optimization failed'
      )
    })

    it('should handle generic errors', async () => {
      const consoleErrorSpy = jest
        .spyOn(console, 'error')
        .mockImplementation()
      ;(build as jest.Mock).mockRejectedValue(new Error('Unknown error'))

      const options: NextBuildOptions = {
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      }

      await expect(nextBuild(options)).rejects.toThrow()

      expect(consoleErrorSpy).toHaveBeenCalledWith('> Build error occurred')

      consoleErrorSpy.mockRestore()
    })
  })

  describe('selective build paths', () => {
    it('should resolve build paths when debugBuildPaths is provided', async () => {
      ;(parseBuildPathsInput as jest.Mock).mockReturnValue(['/app/page'])
      ;(resolveBuildPaths as jest.Mock).mockResolvedValue({
        appPaths: ['/app/page'],
        pagePaths: [],
      })

      const options: NextBuildOptions = {
        debugBuildPaths: '/app/page',
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      }

      await nextBuild(options)

      expect(parseBuildPathsInput).toHaveBeenCalledWith('/app/page')
      expect(resolveBuildPaths).toHaveBeenCalledWith(['/app/page'], '/mock/project')
      expect(build).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        ['/app/page'], // resolvedAppPaths
        [] // resolvedPagePaths
      )
    })

    it('should handle build path resolution errors', async () => {
      ;(parseBuildPathsInput as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid pattern')
      })

      const options: NextBuildOptions = {
        debugBuildPaths: 'invalid-pattern',
        mangling: true,
        experimentalDebugMemoryUsage: false,
        experimentalBuildMode: 'default',
      }

      await expect(nextBuild(options)).rejects.toThrow(
        'printAndExit: Failed to resolve build paths: Invalid pattern'
      )
    })
  })
})
