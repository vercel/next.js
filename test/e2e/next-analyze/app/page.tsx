'use client'

import { useState } from 'react'
import './styles.css'
import { reExportedValue } from './barrel'
import { syncValue } from './sync'

export default function Page() {
  const [value, setValue] = useState(`${syncValue}:${reExportedValue}`)

  async function loadDeferred() {
    const [{ lazyValue }, { workerValue }, { default: Image }] =
      await Promise.all([
        import('./lazy'),
        import('./report.worker'),
        import('next/image'),
      ])
    setValue(`${lazyValue}:${workerValue}:${Image.displayName}`)
  }

  return <button onClick={loadDeferred}>{value}</button>
}
