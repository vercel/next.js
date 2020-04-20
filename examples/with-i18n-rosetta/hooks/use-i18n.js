import { useContext, useState, useRef, useEffect } from 'react'
import { I18nContext, defaultLanguage } from '../lib/i18n'

export default function useI18n({ lng, lngDict }) {
  const [activeDict, setActiveDict] = useState(() => lngDict)
  // OR detect language based on navigator.language OR user setting (cookie)
  const activeLocaleRef = useRef(lng || defaultLanguage)
  const firstRender = useRef(true)
  const [, setTick] = useState(0)

  const i18n = useContext(I18nContext)

  // for initial SSR render
  if (lng && firstRender.current === true) {
    firstRender.current = false
    i18n.locale(lng)
    i18n.set(lng, activeDict)
  }

  useEffect(() => {
    if (lng) {
      i18n.locale(lng)
      i18n.set(lng, activeDict)
      activeLocaleRef.current = lng
      // force rerender
      setTick(tick => tick + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lng])

  return {
    activeLocale: activeLocaleRef.current,
    t: (...args) => i18n.t(...args),
    locale: (l, dict) => {
      i18n.locale(l)
      activeLocaleRef.current = l
      if (dict) {
        i18n.set(l, dict)
        setActiveDict(dict)
      } else {
        // force rerender
        setTick(tick => tick + 1)
      }
    },
  }
}
