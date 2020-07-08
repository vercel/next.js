import React from 'react'
import { useTranslation } from 'react-i18next'

export function App() {
  const { t } = useTranslation()
  return (
    <>
      <h1>{t('title')}</h1>
      <p>{t('description.part1')}</p>
    </>
  )
}
