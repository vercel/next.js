import React from 'react'
import { useTranslation } from 'react-i18next'

export default () => {
  const { t } = useTranslation()

  return (
    <React.Fragment>
      <h1>{t('hello')}</h1>
    </React.Fragment>
  )
}
