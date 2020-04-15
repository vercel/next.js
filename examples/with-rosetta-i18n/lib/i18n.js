import { createContext } from 'react'
import rosetta from 'rosetta'

// import rosetta from 'rosetta/debug';

const i18n = rosetta({
  en: {
    contact: {
      email: 'en@company.com',
    },
    intro: {
      welcome: 'Welcome, {{username}}!',
      text: 'I hope you find this useful.',
    },
  },
  de: {
    contact: {
      email: 'de@company.com',
    },
    intro: {
      welcome: 'Willkommen, {{username}}!',
      text: 'Ich hoffe, du findest das nützlich.',
    },
  },
})

export const defaultLanguage = 'en'
export const languages = ['de', 'en']
export const contentLanguageMap = { de: 'de-DE', en: 'en-US' }

export const I18nContext = createContext()

// default language
i18n.locale(defaultLanguage)

export default function I18n({ children }) {
  return <I18nContext.Provider value={i18n}>{children}</I18nContext.Provider>
}
