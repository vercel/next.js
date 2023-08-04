import { useCallback, useMemo } from 'react'
import { useTranslation } from 'next-i18next'
import { useRouter } from 'next/router'

export default function useChangeLanguage() {
  const { i18n } = useTranslation()
  const currentLanguage = useMemo(() => i18n.language, [i18n])
  const router = useRouter()
  const changeLanguage = useCallback(
    async (lang: string) => {
      const oldLang = currentLanguage.slice()
      await i18n.changeLanguage(lang)
      if (router.asPath === '/en' || router.asPath === '/ja') {
        router.push(`${router.asPath.replace(`/${oldLang}`, `/${lang}`)}`)
      } else {
        router.push(`${router.asPath.replace(`/${oldLang}/`, `/${lang}/`)}`)
      }
    },
    [i18n, router, currentLanguage]
  )
  return {
    currentLanguage,
    changeLanguage,
  }
}
