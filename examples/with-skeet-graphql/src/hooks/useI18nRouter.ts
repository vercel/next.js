import { useCallback, useMemo } from 'react'
import { useTranslation } from 'next-i18next'
import { useRouter } from 'next/router'

export default function useI18nRouter() {
  const { i18n } = useTranslation()
  const currentLanguage = useMemo(() => i18n.language, [i18n])
  const router = useRouter()
  const routerPush = useCallback(
    (path: string) => {
      router.push(`/${currentLanguage}${path}`)
    },
    [router, currentLanguage]
  )
  return {
    router,
    currentLanguage,
    routerPush,
  }
}
