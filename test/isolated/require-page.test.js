/* global describe, it, expect */

import { join } from 'path'
import {SERVER_DIRECTORY, CLIENT_STATIC_FILES_PATH} from 'next-server/constants'
import requirePage, {getPagePath, normalizePagePath, pageNotFoundError} from 'next-server/dist/server/require'

const sep = '/'
const distDir = join(__dirname, '_resolvedata')
const pathToBundles = join(distDir, SERVER_DIRECTORY, CLIENT_STATIC_FILES_PATH, 'development', 'pages')

describe('pageNotFoundError', () => {
  it('Should throw error with ENOENT code', () => {
    try {
      pageNotFoundError('test')
    } catch (err) {
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
  it('Should append /index to the / page', () => {
    const pagePath = getPagePath('/', {distDir})
    expect(pagePath).toBe(join(pathToBundles, `${sep}index.js`))
  })

  it('Should prepend / when a page does not have it', () => {
    const pagePath = getPagePath('_error', {distDir})
    expect(pagePath).toBe(join(pathToBundles, `${sep}_error.js`))
  })

  it('Should throw with paths containing ../', () => {
    expect(() => getPagePath('/../../package.json', {distDir})).toThrow()
  })
})

describe('requirePage', () => {
  it('Should require /index.js when using /', async () => {
    const page = await requirePage('/', {distDir})
    expect(page.test).toBe('hello')
  })

  it('Should require /index.js when using /index', async () => {
    const page = await requirePage('/index', {distDir})
    expect(page.test).toBe('hello')
  })

  it('Should require /world.js when using /world', async () => {
    const page = await requirePage('/world', {distDir})
    expect(page.test).toBe('world')
  })

  it('Should throw when using /../../test.js', async () => {
    try {
      await requirePage('/../../test', {distDir})
    } catch (err) {
      expect(err.code).toBe('ENOENT')
    }
  })

  it('Should throw when using non existent pages like /non-existent.js', async () => {
    try {
      await requirePage('/non-existent', {distDir})
    } catch (err) {
      expect(err.code).toBe('ENOENT')
    }
  })

  it('Should bubble up errors in the child component', async () => {
    try {
      await requirePage('/non-existent-child', {distDir})
    } catch (err) {
      expect(err.code).toBe('MODULE_NOT_FOUND')
    }
  })
})
