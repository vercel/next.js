import React from 'react'
import { withNamespaces } from 'react-i18next'

function MyComponent ({ t }) {
  return <p>{t('extendedComponent')}</p>
}

const Extended = withNamespaces('common')(MyComponent)

export default Extended
