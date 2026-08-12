'use client'

import { useState } from 'react'
import { lazyAction } from './actions'
import { sharedValue } from './shared'
import styles from './target.module.css'

export function Target() {
  const [actionResult, setActionResult] = useState('action idle')

  return (
    <>
      <p id="target" className={styles.target}>
        lazy-marker-9a4e
      </p>
      <p id="lazy-shared">{sharedValue}</p>
      <button
        id="run-action"
        onClick={async () => setActionResult(await lazyAction())}
      >
        run action
      </button>
      <p id="action-result">{actionResult}</p>
    </>
  )
}
