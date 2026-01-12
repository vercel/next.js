'use client'

import { revalidateAction } from './actions'

export function RevalidateButton() {
  return (
    <form action={revalidateAction}>
      <button id="revalidate-button" type="submit">
        Revalidate
      </button>
    </form>
  )
}
