import { normalizePagePath } from './normalize-page-path'

describe('normalizePagePath', () => {
  ;[
    ['/', '/index'],
    ['/index/foo', '/index/index/foo'],
    ['/index', '/index/index'],
  ].forEach(([input, expected]) => {
    it(`${input} -> ${expected}`, () => {
      expect(normalizePagePath(input)).toBe(expected)
    })
  })
})
