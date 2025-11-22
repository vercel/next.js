import path from 'path'

describe('getPageExtensions()', () => {
  const originalCwd = process.cwd

  afterEach(() => {
    jest.resetModules()
    jest.restoreAllMocks()
  })

  afterAll(() => {
    process.cwd = originalCwd
  })

  it('returns default extensions when next.config.js is not found', () => {
    jest.isolateModules(() => {
      const getPageExtensions =
        require('../../../../packages/eslint-plugin-next/src/utils/url').getPageExtensions

      expect(getPageExtensions()).toEqual(['tsx', 'ts', 'jsx', 'js'])
    })
  })

  it('returns custom extensions from next.config.js', () => {
    jest.isolateModules(() => {
      const fs = require('fs')
      jest.spyOn(fs, 'existsSync').mockReturnValue(true)

      jest.doMock(
        path.resolve(process.cwd(), 'next.config.js'),
        () => ({ pageExtensions: ['md', 'mdx'] }),
        { virtual: true }
      )

      const getPageExtensions =
        require('../../../../packages/eslint-plugin-next/src/utils/url').getPageExtensions

      expect(getPageExtensions()).toEqual(['md', 'mdx'])
    })
  })

  it('falls back to default when pageExtensions is not an array', () => {
    jest.doMock(
      path.resolve(process.cwd(), 'next.config.js'),
      () => ({ pageExtensions: 'invalid' }),
      { virtual: true }
    )

    jest.isolateModules(() => {
      const getPageExtensions =
        require('../../../../packages/eslint-plugin-next/src/utils/url').getPageExtensions

      expect(getPageExtensions()).toEqual(['tsx', 'ts', 'jsx', 'js'])
    })
  })

  it('removes leading dots from extensions', () => {
    jest.isolateModules(() => {
      const fs = require('fs')
      jest.spyOn(fs, 'existsSync').mockReturnValue(true)

      jest.doMock(
        path.resolve(process.cwd(), 'next.config.js'),
        () => ({ pageExtensions: ['.tsx', '.ts'] }),
        { virtual: true }
      )

      const getPageExtensions =
        require('../../../../packages/eslint-plugin-next/src/utils/url').getPageExtensions

      expect(getPageExtensions()).toEqual(['tsx', 'ts'])
    })
  })

  it('returns default when pageExtensions is empty array', () => {
    jest.doMock(
      path.resolve(process.cwd(), 'next.config.js'),
      () => ({ pageExtensions: [] }),
      { virtual: true }
    )

    jest.isolateModules(() => {
      const getPageExtensions =
        require('../../../../packages/eslint-plugin-next/src/utils/url').getPageExtensions

      expect(getPageExtensions()).toEqual(['tsx', 'ts', 'jsx', 'js'])
    })
  })

  it('supports next.config.mjs with ES module export', () => {
    jest.isolateModules(() => {
      const fs = require('fs')
      jest
        .spyOn(fs, 'existsSync')
        .mockImplementation((filepath: string | Buffer | URL) => {
          if (filepath.toString().endsWith('next.config.mjs')) return true
          return false
        })

      jest.doMock(
        path.resolve(process.cwd(), 'next.config.mjs'),
        () => ({ default: { pageExtensions: ['page.tsx', 'page.ts'] } }),
        { virtual: true }
      )

      const getPageExtensions =
        require('../../../../packages/eslint-plugin-next/src/utils/url').getPageExtensions

      expect(getPageExtensions()).toEqual(['page.tsx', 'page.ts'])
    })
  })

  it('handles custom extensions like .page.tsx and .mdx', () => {
    jest.isolateModules(() => {
      const fs = require('fs')
      jest.spyOn(fs, 'existsSync').mockReturnValue(true)

      jest.doMock(
        path.resolve(process.cwd(), 'next.config.js'),
        () => ({ pageExtensions: ['page.tsx', 'page.ts', 'mdx'] }),
        { virtual: true }
      )

      const getPageExtensions =
        require('../../../../packages/eslint-plugin-next/src/utils/url').getPageExtensions

      expect(getPageExtensions()).toEqual(['page.tsx', 'page.ts', 'mdx'])
    })
  })

  it('memoizes the result on subsequent calls', () => {
    jest.isolateModules(() => {
      const {
        getPageExtensions,
      } = require('../../../../packages/eslint-plugin-next/src/utils/url')

      const firstCall = getPageExtensions()
      const secondCall = getPageExtensions()

      expect(firstCall).toBe(secondCall) // Same reference
      expect(firstCall).toEqual(['tsx', 'ts', 'jsx', 'js'])
    })
  })
})
