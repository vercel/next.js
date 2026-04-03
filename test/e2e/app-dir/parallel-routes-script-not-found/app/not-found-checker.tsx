'use client'

import { useEffect } from 'react'

declare global {
  interface Window {
    __LAYOUT_SCRIPT_RAN?: boolean
  }
}

export function ScriptChecker() {
  useEffect(() => {
    document.body.setAttribute(
      'data-script-ran',
      String(!!window.__LAYOUT_SCRIPT_RAN)
    )
  }, [])
  return null
}
