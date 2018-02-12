/* global describe, it, expect */

import { join, sep } from 'path'
import requirePage, {getPagePath, normalizePagePath, pageNotFoundError} from '../../dist/server/require'

const dir = '/path/to/some/project'
const dist = '.next'

const pathToBundles = join(dir, dist, 'dist', 'bundles', 'pages')

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
    const pagePath = getPagePath('/', {dir, dist})
    expect(pagePath).toBe(join(pathToBundles, `${sep}index`))
  })

  it('Should prepend / when a page does not have it', () => {
    const pagePath = getPagePath('_error', {dir, dist})
    expect(pagePath).toBe(join(pathToBundles, `${sep}_error`))
  })

  it('Should throw with paths containing ../', () => {
    expect(() => getPagePath('/../../package.json', {dir, dist})).toThrow()
  })
})

describe('requirePage', () => {
  it('Should require /index.js when using /', () => {
    const page = requirePage('/', {dir: __dirname, dist: '_resolvedata'})
    expect(page.test).toBe('hello')
  })

  it('Should require /index.js when using /index', () => {
    const page = requirePage('/index', {dir: __dirname, dist: '_resolvedata'})
    expect(page.test).toBe('hello')
  })

  it('Should require /world.js when using /world', () => {
    const page = requirePage('/world', {dir: __dirname, dist: '_resolvedata'})
    expect(page.test).toBe('world')
  })

  it('Should throw when using /../../test.js', () => {
    expect(() => requirePage('/../../test.js', {dir: __dirname, dist: '_resolvedata'})).toThrow()
  })

  it('Should throw when using non existent pages like /non-existent.js', () => {
    expect(() => requirePage('/non-existent.js', {dir: __dirname, dist: '_resolvedata'})).toThrow()
  })
})
