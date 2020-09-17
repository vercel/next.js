/* eslint-env jest */

function reloadModule() {
  jest.resetModules()
  return require('next/dist/next-server/lib/utils')
}

describe('getAsPath', () => {
  let getAsPath

  describe('without basePath', () => {
    beforeEach(() => {
      process.env.__NEXT_ROUTER_BASEPATH = undefined
      getAsPath = reloadModule().getAsPath
    })

    it('keeps query and hash', () => {
      const pathname = '/path?foo=bar#baz'
      expect(getAsPath(pathname)).toBe(pathname)
    })
  })

  describe('with basePath', () => {
    beforeEach(() => {
      process.env.__NEXT_ROUTER_BASEPATH = '/base/path'
      getAsPath = reloadModule().getAsPath
    })

    it('trims basePath from homepage', () => {
      expect(getAsPath('/base/path?foo=bar#baz')).toBe('/?foo=bar#baz')
    })

    it('trims the basePath while keeping query and hash', () => {
      expect(getAsPath('/base/path/page?foo=bar#baz')).toBe('/page?foo=bar#baz')
    })
  })
})
