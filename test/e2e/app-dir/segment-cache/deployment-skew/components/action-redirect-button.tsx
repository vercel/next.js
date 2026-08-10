'use client'

import { redirectToOtherDeployment } from './redirect-action'

export function ActionRedirectButton() {
  return (
    <form action={redirectToOtherDeployment}>
      <button id="redirect-action-button" type="submit">
        Redirect via Server Action
      </button>
    </form>
  )
}
