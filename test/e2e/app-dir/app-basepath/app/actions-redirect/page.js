'use client'

import { redirectAction } from './actions'

export default function Counter() {
  return (
    <form>
      <button
        id="redirect-external"
        formAction={() => redirectAction(`${window.location.origin}/external`)}
      >
        redirect external
      </button>
    </form>
  )
}
