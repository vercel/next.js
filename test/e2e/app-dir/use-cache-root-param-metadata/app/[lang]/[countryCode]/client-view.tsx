'use client'

import { readRootLanguage } from './root-reader'

export function ClientView() {
  return <button onClick={() => readRootLanguage()}>client</button>
}
