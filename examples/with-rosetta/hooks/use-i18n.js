import { useContext, useState } from 'react'
import { I18nContext } from '../lib/i18n'

export default function useI18n(lng) {
  const [, setTick] = useState(0)

  const i18n = useContext(I18nContext)
  if (lng) {
    i18n.locale(lng)
  }
  return {
    set: (...args) => i18n.set(...args),
    t: (...args) => i18n.t(...args),
    locale: lang => {
      i18n.locale(lang)
      // force rerender
      setTick(tick => tick + 1)
    },
  }
}
