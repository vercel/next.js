'use strict'
Object.defineProperty(exports, '__esModule', {
  value: true,
})
exports.detectDomainLocale = detectDomainLocale
function detectDomainLocale(domainItems, hostname, detectedLocale) {
  let domainItem
  if (domainItems) {
    if (detectedLocale) {
      detectedLocale = detectedLocale.toLowerCase()
    }
    for (const item of domainItems) {
      var ref, ref1
      // remove port if present
      const domainHostname =
        (ref = item.domain) == null ? void 0 : ref.split(':')[0].toLowerCase()
      if (
        hostname === domainHostname ||
        detectedLocale === item.defaultLocale.toLowerCase() ||
        ((ref1 = item.locales) == null
          ? void 0
          : ref1.some((locale) => locale.toLowerCase() === detectedLocale))
      ) {
        domainItem = item
        break
      }
    }
  }
  return domainItem
}

if (
  (typeof exports.default === 'function' ||
    (typeof exports.default === 'object' && exports.default !== null)) &&
  typeof exports.default.__esModule === 'undefined'
) {
  Object.defineProperty(exports.default, '__esModule', { value: true })
  Object.assign(exports.default, exports)
  module.exports = exports.default
}

//# sourceMappingURL=detect-domain-locale.js.map
