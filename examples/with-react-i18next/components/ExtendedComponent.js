import React from 'react'
import { translate } from 'react-i18next'

function MyComponennt ({ t }) {
  return (
    <div>
      {t('extendedComponent')}
    </div>
  )
}

const Extended = translate('common')(MyComponennt)

export default Extended
