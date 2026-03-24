'use client'

import { useTranslations } from 'next-intl'

export default function IntlClientPage() {
  const t = useTranslations('HomePage')
  return (
    <div>
      <h1 id="intl-client-title">{t('title')}</h1>
    </div>
  )
}
