/* global describe, it, expect */

import { join } from 'path'
import {getPagePath} from '../../dist/server/require'

const dir = '/path/to/some/project'
const dist = '.next'

const pathToBundles = join(dir, dist, 'dist', 'bundles', 'pages')

describe('Require path', () => {
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
