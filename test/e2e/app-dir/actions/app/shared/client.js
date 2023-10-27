'use client'

import { inc } from './action'

export function Client() {
  return (
    <form>
      <button id="client-inc" formAction={inc}>
        Inc
      </button>
    </form>
  )
}
