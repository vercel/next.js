import Link from 'next/link'
import { useRouter } from 'next/router'
import { t } from '@lingui/macro'

const availableLanguageNames = {
  en: t`English`,
  sv: t`Swedish`,
}

export default function LangSwitcher() {
  const { locale, locales, route } = useRouter()
  const otherLocale = locales?.find((cur) => cur !== locale)

  return (
    <Link
      href={route}
      locale={otherLocale}
      style={{ display: 'block', marginBottom: '20px' }}
    >
      {availableLanguageNames[otherLocale]}
    </Link>
  )
}
