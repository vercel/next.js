/* eslint-env jest */

import { join } from 'path'
import { SERVER_DIRECTORY, CLIENT_STATIC_FILES_PATH } from 'next/constants'
import { normalizePagePath } from 'next/dist/shared/lib/page-path/normalize-page-path'
import { requirePage, getPagePath } from 'next/dist/server/require'
import { PageNotFoundError } from 'next/dist/shared/lib/utils'
import type { Page } from 'next/dist/shared/lib/route-types'

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
      throw new PageNotFoundError('test')
    } catch (err) {
      expect(err.code).toBe('ENOENT')
    }
  })
})

describe('normalizePagePath', () => {
  it('Should turn / into /index', () => {
    expect(normalizePagePath('/' as Page)).toBe(`${sep}index`)
  })

  it('Should turn _error into /_error', () => {
    expect(normalizePagePath('_error' as Page)).toBe(`${sep}_error`)
  })

  it('Should turn /abc into /abc', () => {
    expect(normalizePagePath('/abc' as Page)).toBe(`${sep}abc`)
  })

  it('Should turn /abc/def into /abc/def', () => {
    expect(normalizePagePath('/abc/def' as Page)).toBe(`${sep}abc${sep}def`)
  })

  it('Should throw on /../../test.js', () => {
    expect(() => normalizePagePath('/../../test.js' as Page)).toThrow()
  })
})

describe('getPagePath', () => {
  it('Should not append /index to the / page', () => {
    expect(() => getPagePath('/' as Page, distDir, undefined, false)).toThrow(
      'Cannot find module for page: /'
    )
  })

  it('Should prepend / when a page does not have it', () => {
    const pagePath = getPagePath('_error' as Page, distDir, undefined, false)
    expect(pagePath).toBe(join(pathToBundles, `${sep}_error.js`))
  })

  it('Should throw with paths containing ../', () => {
    expect(() =>
      getPagePath('/../../package.json' as Page, distDir, undefined, false)
    ).toThrow()
  })
})

describe('requirePage', () => {
  it('Should not find page /index when using /', async () => {
    await expect(requirePage('/' as Page, distDir, false)).rejects.toThrow(
      'Cannot find module for page: /'
    )
  })

  it('Should require /index.js when using /index', async () => {
    const page = await requirePage('/index' as Page, distDir, false)
    expect(page.test).toBe('hello')
  })

  it('Should require /world.js when using /world', async () => {
    const page = await requirePage('/world' as Page, distDir, false)
    expect(page.test).toBe('world')
  })

  it('Should throw when using /../../test.js', async () => {
    expect.assertions(1)
    try {
      await requirePage('/../../test' as Page, distDir, false)
    } catch (err) {
      expect(err.code).toBe('ENOENT')
    }
  })

  it('Should throw when using non existent pages like /non-existent.js', async () => {
    expect.assertions(1)
    try {
      await requirePage('/non-existent' as Page, distDir, false)
    } catch (err) {
      expect(err.code).toBe('ENOENT')
    }
  })

  it('Should bubble up errors in the child component', async () => {
    expect.assertions(1)
    try {
      await requirePage('/non-existent-child' as Page, distDir, false)
    } catch (err) {
      expect(err.code).toBe('MODULE_NOT_FOUND')
    }
  })
})
