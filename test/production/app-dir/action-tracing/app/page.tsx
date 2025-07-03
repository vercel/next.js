'use client'

import { action } from './action'

export default function Page() {
  return (
    <button
      onClick={() => {
        action()
      }}
    >
      click
    </button>
  )
}
