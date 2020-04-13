import { useContext, useState, useRef, useEffect } from 'react'
import { I18nContext, defaultLanguage } from '../lib/i18n'

export default function useI18n(loc) {
  const activeLocaleRef = useRef(loc || defaultLanguage)
  const [, setTick] = useState(0)

  const i18n = useContext(I18nContext)
  if (loc) {
    i18n.locale(loc)
  }

  useEffect(() => {
    if (loc) {
      i18n.locale(loc)
      activeLocaleRef.current = loc
      // force rerender
      setTick(tick => tick + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc])

  return {
    activeLocale: activeLocaleRef.current,
    set: (...args) => {
      i18n.set(...args)
      // force rerender
      setTick(tick => tick + 1)
    },
    t: (...args) => i18n.t(...args),
    locale: l => {
      i18n.locale(l)
      activeLocaleRef.current = l
      // force rerender
      setTick(tick => tick + 1)
    },
  }
}
