import express from 'express'
import i18next from 'i18next'

let client = i18next

if (!client.isInitialized) {
  // @ts-ignore - need to be define in a global.d.ts within your project (see: https://github.com/zeit/next.js/issues/2177#issuecomment-357438567)
  if (!process.browser) {
    // using eval to load only on server side (see: https://arunoda.me/blog/ssr-and-server-only-modules)
    const i18nextMiddleware = eval("require('i18next-express-middleware')")

    const serverDetectors = new i18nextMiddleware.LanguageDetector()
    serverDetectors.addDetector({
      cacheUserLanguage: () => null,
      lookup: (req: express.Request) => req.query.lng,
      name: 'customDetector',
    })

    //TODO: use custom server backend (for example: i18next-node-remote-backend)

    client.use(serverDetectors)
  } else {
    //TODO: use custom client backend (for example: i18next-xhr-backend)
  }

  client.init({
    debug: false,
    interpolation: {
      escapeValue: false, // not needed for react as it escapes by default
    },
    fallbackLng: 'en',
    detection: {
      order: ['customDetector'],
    },
    resources: {
      en: {
        translation: {
          hello: 'hello world',
        },
      },
      fr: {
        translation: {
          hello: 'bonjour tout le monde',
        },
      },
    },
  })
}

export default client
