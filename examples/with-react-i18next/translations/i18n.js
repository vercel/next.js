import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import enTranslation from './locales/en/translation'
import deTranslation from './locales/de/translation'
import enOverview from './locales/en/overview'
import deOverview from './locales/de/overview'

const resources = {
  en: { translation: enTranslation, overview: enOverview },
  de: { translation: deTranslation, overview: deOverview },
}

i18n
  .use(initReactI18next) // pass the i18n instance to react-i18next
  .init({
    resources,
    lng: 'en', // default language
    fallbackLng: 'en', // fallback language
    supportedLngs: ['en', 'de'], // array of supported languages
    interpolation: {
      escapeValue: false, // react already protects from xss so set this to false
    },
    debug: false, // set to true to log helpful errors to console, should be false for production
  })

export default i18n
