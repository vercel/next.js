'use client'

import React from 'react'
import { cookieAction } from './actions'

export default function Page() {
  const api = async () => {
    await fetch('/api')
  }

  return (
    <>
      <button id="action" onClick={() => cookieAction()}>
        click
      </button>
      <button id="api" onClick={() => api()}>
        click
      </button>
    </>
  )
}
