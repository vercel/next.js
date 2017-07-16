import React from 'react'

// pure component just getting t function by props
export default function PureComponent ({ t }) {
  return (
    <div>
      {t('common:pureComponent')}
    </div>
  )
}
