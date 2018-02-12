/* global describe, it, expect */

import { join } from 'path'
import {getPagePath, normalizePagePath, pageNotFoundError} from '../../dist/server/require'

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
    expect(normalizePagePath('/')).toBe('/index')
  })

  it('Should turn _error into /_error', () => {
    expect(normalizePagePath('_error')).toBe('/_error')
  })

  it('Should turn /abc into /abc', () => {
    expect(normalizePagePath('/abc')).toBe('/abc')
  })

  it('Should turn /abc/def into /abc/def', () => {
    expect(normalizePagePath('/abc/def')).toBe('/abc/def')
  })

  it('Should throw on /../../test.js', () => {
    expect(() => normalizePagePath('/../../test.js')).toThrow()
  })
})

describe('getPagePath', () => {
  it('Should append /index to the / page', () => {
    const pagePath = getPagePath('/', {dir, dist})
    expect(pagePath).toBe(join(pathToBundles, '/index'))
  })

  it('Should prepend / when a page does not have it', () => {
    const pagePath = getPagePath('_error', {dir, dist})
    expect(pagePath).toBe(join(pathToBundles, '/_error'))
  })

  it('Should throw with paths containing ../', () => {
    expect(() => getPagePath('/../../package.json', {dir, dist})).toThrow()
  })
})
