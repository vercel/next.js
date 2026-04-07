/* eslint-disable no-extend-native */

// https://nextjs.org/docs/app/getting-started/installation#supported-browsers
// Contains polyfills for methods missing after browser version(s):
// Edge 111, Firefox 111, Chrome 111, Safari 16.4

/**
 * Available in:
 * Edge: 120
 * Firefox: 115
 * Chrome: 120
 * Safari: 17.0
 *
 * https://caniuse.com/mdn-api_url_canparse_static
 */
// Modified from https://github.com/zloirock/core-js/blob/master/packages/core-js/modules/web.url.can-parse.js
if (!('canParse' in URL)) {
  URL.canParse = function (url, base) {
    try {
      return !!new URL(url, base)
    } catch {
      return false
    }
  }
}
