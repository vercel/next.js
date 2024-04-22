/* eslint-disable no-script-url */
import { URL } from 'url'
import { isJavaScriptProtocol } from './xss-protection'

test.each([
  'javascript:alert(1)',
  'ja\t\tva\t\t\tscript:alert(1)',
  'ja\t\r\nva\t\t\tscr\n\ript:alert(1)',
  // javascript:alert(1)
  '\u006a\u0061\u0076\u0061\u0073\u0063\u0072\u0069\u0070\u0074\u003a\u0061\u006c\u0065\u0072\u0074\u0028\u0031\u0029',
])(`case #%# %s is using javascript protocol`, (input) => {
  // Check if these are actually using javascript protocol
  expect(new URL(input).protocol).toBe('javascript:')
  expect(isJavaScriptProtocol(input)).toBe(true)
})

test.each([
  '/javascript:alert(1)',
  'javascript-invalid-protocol:alert(1)',
  'javascript',
  'ja vascript:alert(1)',
])(`case #%# %s is not using javascript protocol`, (input) => {
  // Check if these are actually not using javascript protocol
  try {
    expect(new URL(input).protocol).not.toBe('javascript:')
  } catch (error: any) {
    if (error.message === 'Invalid URL') {
      // This is expected for invalid protocols
    } else {
      throw error
    }
  }
  expect(isJavaScriptProtocol(input)).toBe(false)
})
