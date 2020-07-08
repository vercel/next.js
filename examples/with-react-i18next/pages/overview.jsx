import React from 'react'
import { useTranslation } from 'react-i18next'

export default function Overview() {
  const { t } = useTranslation(['translation', 'overview'])
  return (
    <>
      <p>{t('overview:title')}</p>
    </>
  )
}
