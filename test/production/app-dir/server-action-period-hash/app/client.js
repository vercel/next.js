'use client'

import { action1 } from './actions'

export function Client({ onClick }) {
  return (
    <div>
      <button
        onClick={() => {
          onClick()
        }}
      >
        click
      </button>
      <button
        onClick={() => {
          action1()
        }}
      >
        action1
      </button>
    </div>
  )
}
