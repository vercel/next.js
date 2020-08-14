const { basename } = require('path')
const glob = require('glob')
const areIntlLocalesSupported = require('intl-locales-supported').default

// Get the supported languages by looking for translations in the `lang/` dir.
const supportedLanguages = glob
  .sync('./lang/*.json')
  .map((f) => basename(f, '.json'))

// Polyfill Node with `Intl` that has data for all locales.
// See: https://formatjs.io/guides/runtime-environments/#server
if (global.Intl) {
  // Determine if the built-in `Intl` has the locale data we need.
  if (!areIntlLocalesSupported(supportedLanguages)) {
    // `Intl` exists, but it doesn't have the data we need, so load the
    // polyfill and patch the constructors we need with the polyfills.
    const IntlPolyfill = require('intl')
    Intl.NumberFormat = IntlPolyfill.NumberFormat
    Intl.DateTimeFormat = IntlPolyfill.DateTimeFormat
    Intl.__disableRegExpRestore = IntlPolyfill.__disableRegExpRestore
  }
} else {
  // No `Intl`, so use and load the polyfill.
  global.Intl = require('intl')
}

// Fix: https://github.com/vercel/next.js/issues/11777
// See related issue: https://github.com/andyearnshaw/Intl.js/issues/308
if (Intl.__disableRegExpRestore) {
  Intl.__disableRegExpRestore()
}

// Polyfill DOMParser for **pre-v4** react-intl used by formatjs.
// Only needed when using FormattedHTMLMessage. Make sure to install `xmldom`.
// See: https://github.com/vercel/next.js/issues/10533
// const { DOMParser } = require('xmldom')
// global.DOMParser = DOMParser

const { readFileSync } = require('fs')
const { createServer } = require('http')
const accepts = require('accepts')
const next = require('next')

const port = parseInt(process.env.PORT, 10) || 3000
const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

// We need to expose React Intl's locale data on the request for the user's
// locale. This function will also cache the scripts by lang in memory.
const localeDataCache = new Map()
const getLocaleDataScript = (locale) => {
  const lang = locale.split('-')[0]
  if (!localeDataCache.has(lang)) {
    const localeDataFile = require.resolve(
      `@formatjs/intl-relativetimeformat/dist/locale-data/${lang}`
    )
    const localeDataScript = readFileSync(localeDataFile, 'utf8')
    localeDataCache.set(lang, localeDataScript)
  }
  return localeDataCache.get(lang)
}

// We need to load and expose the translations on the request for the user's
// locale. These will only be used in production, in dev the `defaultMessage` in
// each message description in the source code will be used.
const getMessages = (locale) => {
  return require(`./lang/${locale}.json`)
}

app.prepare().then(() => {
  createServer((req, res) => {
    const accept = accepts(req)
    const locale = accept.language(supportedLanguages) || 'en'
    req.locale = locale
    req.localeDataScript = getLocaleDataScript(locale)
    req.messages = dev ? {} : getMessages(locale)
    handle(req, res)
  }).listen(port, (err) => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${port}`)
  })
})
