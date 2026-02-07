'use client'
import {
  updateAction,
  revalidateAction,
  deprecatedRevalidateAction,
} from './actions'

export function Buttons() {
  return (
    <>
      <button type="button" id="update-button" onClick={() => updateAction()}>
        Update Tag
      </button>
      <button
        type="button"
        id="revalidate-button"
        onClick={() => revalidateAction()}
      >
        Revalidate Tag
      </button>
      <button
        type="button"
        id="deprecated-button"
        onClick={() => deprecatedRevalidateAction()}
      >
        Deprecated Revalidate
      </button>
    </>
  )
}
