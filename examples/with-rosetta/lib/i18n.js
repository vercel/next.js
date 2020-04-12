import { createContext } from 'react'
import rosetta from 'rosetta'

const i18n = rosetta({
  en: {
    intro: {
      welcome: 'Welcome, {{username}}!',
      text: 'I hope you find this useful.',
    },
  },
  de: {
    intro: {
      welcome: 'Willkommen, {{username}}!',
      text: 'Ich hoffe, du findest das nützlich.',
    },
  },
})

// default language
i18n.locale('en')

export const languages = ['de', 'en']

export const I18nContext = createContext()

export default function I18n({ children }) {
  return <I18nContext.Provider value={i18n}>{children}</I18nContext.Provider>
}
