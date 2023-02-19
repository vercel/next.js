'use client'

import { useState } from 'react'
import useTranslation from 'next-translate/useTranslation'

export default function Counter() {
  const { t } = useTranslation('common')
  const [count, setCount] = useState(0)
  return (
    <p>
      This compoment is rendered on client:{' '}
      <button onClick={() => setCount((n) => n - 1)}>
        {t('counter.decrement')}
      </button>{' '}
      {count}{' '}
      <button onClick={() => setCount((n) => n + 1)}>
        {t('counter.increment')}
      </button>
    </p>
  )
}
