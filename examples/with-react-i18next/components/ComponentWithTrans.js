import React from 'react'
import { Trans } from 'react-i18next'

export default function ComponentWithTrans () {
  return (
    <p>
      <Trans i18nKey='common:transComponent'>
        Alternatively, you can use <code>Trans</code> component.
      </Trans>
    </p>
  )
}
