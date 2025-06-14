import path from 'path'

describe('getPageExtensions()', () => {
  const originalCwd = process.cwd

  afterEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  afterAll(() => {
    process.cwd = originalCwd
  })

  it('returns default extensions when next.config.js is not found', () => {
    jest.isolateModules(() => {
      const getPageExtensions =
        require('../../../../packages/eslint-plugin-next/src/utils/url').getPageExtensions

      expect(getPageExtensions()).toEqual(['js', 'jsx', 'ts', 'tsx'])
    })
  })

  it('returns custom extensions from next.config.js', () => {
    jest.doMock(
      path.resolve(process.cwd(), 'next.config.js'),
      () => ({ pageExtensions: ['md', 'mdx'] }),
      { virtual: true }
    )

    jest.isolateModules(() => {
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

      expect(getPageExtensions()).toEqual(['js', 'jsx', 'ts', 'tsx'])
    })
  })
})
