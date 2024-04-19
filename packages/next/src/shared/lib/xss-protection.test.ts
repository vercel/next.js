/* eslint-disable no-script-url */
import { isJavaScriptProtocol } from './xss-protection'

// Be sure to check first if these are actually treated as javascript protocols by browsers.
// We could test each in the browser but this is too slow.
test.each([
  'javascript:alert(1)',
  'ja\t\tva\t\t\tscript:alert(1)',
  'ja\t\r\nva\t\t\tscr\n\ript:alert(1)',
])(`case #%# %s is using javascript protocol`, (input) => {
  expect(isJavaScriptProtocol(input)).toBe(true)
})

// Be sure to check first if these are actually not treated as javascript protocols by browsers.
// We could test each in the browser but this is too slow.
test.each([
  '/javascript:alert(1)',
  'javascript-invalid-protocol:alert(1)',
  'javascript',
  'ja vascript:alert(1)',
])(`case #%# %s is not using javascript protocol`, (input) => {
  expect(isJavaScriptProtocol(input)).toBe(false)
})
