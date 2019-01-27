/* eslint-env jest */
import {htmlescape} from 'next/dist/server/htmlescape'
import vm from 'vm'

describe('htmlescape', () => {
  test('with angle brackets should escape', () => {
    const evilObj = {evil: '<script></script>'}
    expect(htmlescape(evilObj)).toBe('{"evil":"\\u003cscript\\u003e\\u003c/script\\u003e"}')
  })

  test('with angle brackets should parse back', () => {
    const evilObj = {evil: '<script></script>'}
    expect(JSON.parse(htmlescape(evilObj))).toMatchObject(evilObj)
  })

  test('with ampersands should escape', () => {
    const evilObj = {evil: '&'}
    expect(htmlescape(evilObj)).toBe('{"evil":"\\u0026"}')
  })

  test('with ampersands should parse back', () => {
    const evilObj = {evil: '&'}
    expect(JSON.parse(htmlescape(evilObj))).toMatchObject(evilObj)
  })

  test('with "LINE SEPARATOR" and "PARAGRAPH SEPARATOR" should escape', () => {
    const evilObj = {evil: '\u2028\u2029'}
    expect(htmlescape(evilObj)).toBe('{"evil":"\\u2028\\u2029"}')
  })

  test('with "LINE SEPARATOR" and "PARAGRAPH SEPARATOR" should parse back', () => {
    const evilObj = {evil: '\u2028\u2029'}
    expect(JSON.parse(htmlescape(evilObj))).toMatchObject(evilObj)
  })

  test('escaped line terminators should work', () => {
    expect(() => {
      vm.runInNewContext('(' + htmlescape({evil: '\u2028\u2029'}) + ')')
    }).not.toThrow()
  })
})
