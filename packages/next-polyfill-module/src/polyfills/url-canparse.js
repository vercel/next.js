/**
 * URL.canParse polyfill
 *
 * Available in:
 * Edge: 120
 * Firefox: 115
 * Chrome: 120
 * Safari: 17.0
 *
 * https://caniuse.com/mdn-api_url_canparse_static
 *
 * Modified from https://github.com/zloirock/core-js/blob/master/packages/core-js/modules/web.url.can-parse.js
 */
if (!('canParse' in URL)) {
  URL.canParse = function (url, base) {
    try {
      return !!new URL(url, base)
    } catch {
      return false
    }
  }
}
