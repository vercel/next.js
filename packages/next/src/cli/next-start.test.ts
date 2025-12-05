import { nextStart, NextStartOptions } from './next-start'

// Mock dependencies
jest.mock('../server/lib/start-server', () => ({
  startServer: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('../server/lib/utils', () => ({
  printAndExit: jest.fn((message: string, code?: number) => {
    throw new Error(`printAndExit: ${message} (code: ${code})`)
  }),
}))

jest.mock('../lib/get-project-dir', () => ({
  getProjectDir: jest.fn((dir?: string) => dir || '/mock/project'),
}))

jest.mock('../lib/helpers/get-reserved-port', () => ({
  isPortIsReserved: jest.fn((port: number) => port === 3000),
  getReservedPortExplanation: jest.fn(
    (port: number) => `Port ${port} is reserved`
  ),
}))

import { startServer } from '../server/lib/start-server'
import { printAndExit } from '../server/lib/utils'
import { getProjectDir } from '../lib/get-project-dir'
import {
  isPortIsReserved,
  getReservedPortExplanation,
} from '../lib/helpers/get-reserved-port'

describe('next-start', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('nextStart', () => {
    it('should start server with basic options', async () => {
      const options: NextStartOptions = {
        port: 3001,
      }

      await nextStart(options)

      expect(getProjectDir).toHaveBeenCalledWith(undefined)
      expect(startServer).toHaveBeenCalledWith({
        dir: '/mock/project',
        isDev: false,
        hostname: undefined,
        port: 3001,
        keepAliveTimeout: undefined,
      })
    })

    it('should start server with custom directory', async () => {
      const options: NextStartOptions = {
        port: 4000,
      }

      await nextStart(options, '/custom/path')

      expect(getProjectDir).toHaveBeenCalledWith('/custom/path')
      expect(startServer).toHaveBeenCalledWith(
        expect.objectContaining({
          dir: '/custom/path',
          port: 4000,
        })
      )
    })

    it('should start server with hostname option', async () => {
      const options: NextStartOptions = {
        port: 3001,
        hostname: 'localhost',
      }

      await nextStart(options)

      expect(startServer).toHaveBeenCalledWith(
        expect.objectContaining({
          hostname: 'localhost',
          port: 3001,
        })
      )
    })

    it('should start server with keepAliveTimeout option', async () => {
      const options: NextStartOptions = {
        port: 3001,
        keepAliveTimeout: 5000,
      }

      await nextStart(options)

      expect(startServer).toHaveBeenCalledWith(
        expect.objectContaining({
          keepAliveTimeout: 5000,
        })
      )
    })

    it('should start server with all options', async () => {
      const options: NextStartOptions = {
        port: 8080,
        hostname: '0.0.0.0',
        keepAliveTimeout: 10000,
      }

      await nextStart(options, '/my/app')

      expect(startServer).toHaveBeenCalledWith({
        dir: '/my/app',
        isDev: false,
        hostname: '0.0.0.0',
        port: 8080,
        keepAliveTimeout: 10000,
      })
    })

    it('should prevent using reserved port', async () => {
      const options: NextStartOptions = {
        port: 3000, // Reserved port
      }

      await expect(nextStart(options)).rejects.toThrow(
        'printAndExit: Port 3000 is reserved (code: 1)'
      )

      expect(isPortIsReserved).toHaveBeenCalledWith(3000)
      expect(getReservedPortExplanation).toHaveBeenCalledWith(3000)
      expect(printAndExit).toHaveBeenCalledWith('Port 3000 is reserved', 1)
      expect(startServer).not.toHaveBeenCalled()
    })

    it('should allow non-reserved ports', async () => {
      ;(isPortIsReserved as jest.Mock).mockReturnValue(false)

      const options: NextStartOptions = {
        port: 8080,
      }

      await nextStart(options)

      expect(isPortIsReserved).toHaveBeenCalledWith(8080)
      expect(startServer).toHaveBeenCalled()
      expect(printAndExit).not.toHaveBeenCalled()
    })

    it('should set isDev to false', async () => {
      const options: NextStartOptions = {
        port: 3001,
      }

      await nextStart(options)

      expect(startServer).toHaveBeenCalledWith(
        expect.objectContaining({
          isDev: false,
        })
      )
    })

    it('should handle startServer errors', async () => {
      ;(startServer as jest.Mock).mockRejectedValue(
        new Error('Server start failed')
      )

      const options: NextStartOptions = {
        port: 3001,
      }

      await expect(nextStart(options)).rejects.toThrow('Server start failed')
    })
  })
})
