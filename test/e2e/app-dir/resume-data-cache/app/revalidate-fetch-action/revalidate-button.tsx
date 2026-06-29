'use client'

import { revalidateFetchAction } from './actions'

export function RevalidateButton() {
  return (
    <form action={revalidateFetchAction}>
      <button id="revalidate-button" type="submit">
        Revalidate
      </button>
    </form>
  )
}
