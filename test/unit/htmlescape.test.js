/* global fixture, test */
import 'testcafe'
// These tests are based on https://github.com/zertosh/htmlescape/blob/3e6cf0614dd0f778fd0131e69070b77282150c15/test/htmlescape-test.js
// License: https://github.com/zertosh/htmlescape/blob/0527ca7156a524d256101bb310a9f970f63078ad/LICENSE
import vm from 'vm'
import { htmlEscapeJsonString } from 'next/dist/server/htmlescape'
import { didThrow } from 'next-test-utils'

fixture('htmlescape')

test('with angle brackets should escape', async t => {
  const evilObj = { evil: '<script></script>' }
  await t
    .expect(htmlEscapeJsonString(JSON.stringify(evilObj)))
    .eql('{"evil":"\\u003cscript\\u003e\\u003c/script\\u003e"}')
})

test('with angle brackets should parse back', async t => {
  const evilObj = { evil: '<script></script>' }
  await t
    .expect(JSON.parse(htmlEscapeJsonString(JSON.stringify(evilObj))))
    .eql(evilObj)
})

test('with ampersands should escape', async t => {
  const evilObj = { evil: '&' }
  await t
    .expect(htmlEscapeJsonString(JSON.stringify(evilObj)))
    .eql('{"evil":"\\u0026"}')
})

test('with ampersands should parse back', async t => {
  const evilObj = { evil: '&' }
  await t
    .expect(JSON.parse(htmlEscapeJsonString(JSON.stringify(evilObj))))
    .eql(evilObj)
})

test('with "LINE SEPARATOR" and "PARAGRAPH SEPARATOR" should escape', async t => {
  const evilObj = { evil: '\u2028\u2029' }
  await t
    .expect(htmlEscapeJsonString(JSON.stringify(evilObj)))
    .eql('{"evil":"\\u2028\\u2029"}')
})

test('with "LINE SEPARATOR" and "PARAGRAPH SEPARATOR" should parse back', async t => {
  const evilObj = { evil: '\u2028\u2029' }
  await t
    .expect(JSON.parse(htmlEscapeJsonString(JSON.stringify(evilObj))))
    .eql(evilObj)
})

test('escaped line terminators should work', async t => {
  await didThrow(() => {
    vm.runInNewContext(
      '(' + htmlEscapeJsonString(JSON.stringify({ evil: '\u2028\u2029' })) + ')'
    )
  }, false)
})
