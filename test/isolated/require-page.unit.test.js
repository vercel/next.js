/* eslint-env jest */

import { join } from 'path'
import { SERVER_DIRECTORY, CLIENT_STATIC_FILES_PATH } from 'next/constants'
import {
  requirePage,
  getPagePath,
  pageNotFoundError,
} from 'next/dist/next-server/server/require'
import { normalizePagePath } from 'next/dist/next-server/server/normalize-page-path'

const sep = '/'
const distDir = join(__dirname, '_resolvedata')
const pathToBundles = join(
  distDir,
  SERVER_DIRECTORY,
  CLIENT_STATIC_FILES_PATH,
  'development',
  'pages'
)

describe('pageNotFoundError', () => {
  it('Should throw error with ENOENT code', () => {
    expect.assertions(1)
    try {
      throw pageNotFoundError('test')
    } catch (err) {
      // eslint-disable-next-line jest/no-try-expect
      expect(err.code).toBe('ENOENT')
    }
  })
})

describe('normalizePagePath', () => {
  it('Should turn / into /index', () => {
    expect(normalizePagePath('/')).toBe(`${sep}index`)
  })

  it('Should turn _error into /_error', () => {
    expect(normalizePagePath('_error')).toBe(`${sep}_error`)
  })

  it('Should turn /abc into /abc', () => {
    expect(normalizePagePath('/abc')).toBe(`${sep}abc`)
  })

  it('Should turn /abc/def into /abc/def', () => {
    expect(normalizePagePath('/abc/def')).toBe(`${sep}abc${sep}def`)
  })

  it('Should throw on /../../test.js', () => {
    expect(() => normalizePagePath('/../../test.js')).toThrow()
  })
})

describe('getPagePath', () => {
  it('Should not append /index to the / page', () => {
    expect(() => getPagePath('/', distDir)).toThrow(
      'Cannot find module for page: /'
    )
  })

  it('Should prepend / when a page does not have it', () => {
    const pagePath = getPagePath('_error', distDir)
    expect(pagePath).toBe(join(pathToBundles, `${sep}_error.js`))
  })

  it('Should throw with paths containing ../', () => {
    expect(() => getPagePath('/../../package.json', distDir)).toThrow()
  })
})

describe('requirePage', () => {
  it('Should not find page /index when using /', async () => {
    await expect(() => requirePage('/', distDir)).toThrow(
      'Cannot find module for page: /'
    )
  })

  it('Should require /index.js when using /index', async () => {
    const page = await requirePage('/index', distDir)
    expect(page.test).toBe('hello')
  })

  it('Should require /world.js when using /world', async () => {
    const page = await requirePage('/world', distDir)
    expect(page.test).toBe('world')
  })

  it('Should throw when using /../../test.js', async () => {
    expect.assertions(1)
    try {
      await requirePage('/../../test', distDir)
    } catch (err) {
      // eslint-disable-next-line jest/no-try-expect
      expect(err.code).toBe('ENOENT')
    }
  })

  it('Should throw when using non existent pages like /non-existent.js', async () => {
    expect.assertions(1)
    try {
      await requirePage('/non-existent', distDir)
    } catch (err) {
      // eslint-disable-next-line jest/no-try-expect
      expect(err.code).toBe('ENOENT')
    }
  })

  it('Should bubble up errors in the child component', async () => {
    expect.assertions(1)
    try {
      await requirePage('/non-existent-child', distDir)
    } catch (err) {
      // eslint-disable-next-line jest/no-try-expect
      expect(err.code).toBe('MODULE_NOT_FOUND')
    }
  })
})
