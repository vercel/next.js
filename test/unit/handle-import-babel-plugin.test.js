/* global describe, it, expect */
import { getModulePath } from '../../dist/server/build/babel/plugins/handle-import'
import { sep } from 'path'

describe('handle-import-babel-plugin', () => {
  describe('getModulePath', () => {
    it('should not do anything to NPM modules', () => {
      const mPath = getModulePath('/abc/pages/about.js', 'cool-module')
      expect(mPath).toBe('cool-module')
    })

    it('should not do anything to private NPM modules', () => {
      const mPath = getModulePath('/abc/pages/about.js', '@zeithq/cool-module')
      expect(mPath).toBe('@zeithq/cool-module')
    })

    it('should resolve local modules', () => {
      const mPath = getModulePath('/abc/pages/about.js', '../components/hello.js')
      expect(mPath).toBe('/abc/components/hello'.replace(/\/g/, sep))
    })

    it('should remove index.js', () => {
      const mPath = getModulePath('/abc/pages/about.js', '../components/c1/index.js')
      expect(mPath).toBe('/abc/components/c1'.replace(/\/g/, sep))
    })

    it('should remove .js', () => {
      const mPath = getModulePath('/abc/pages/about.js', '../components/bb.js')
      expect(mPath).toBe('/abc/components/bb'.replace(/\/g/, sep))
    })

    it('should remove end slash', () => {
      const mPath = getModulePath('/abc/pages/about.js', '../components/bb/')
      expect(mPath).toBe('/abc/components/bb'.replace(/\/g/, sep))
    })
  })
})
