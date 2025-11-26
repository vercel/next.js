'use client'

import { actionNotFound } from './action'

export default function Page() {
  return (
    <button
      id="trigger-not-found"
      onClick={() => {
        actionNotFound()
      }}
    >
      trigger not found
    </button>
  )
}
