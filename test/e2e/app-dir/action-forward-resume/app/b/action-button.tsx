'use client'

import { useActionReference } from '../action-context'

export function ActionButton() {
  const { action } = useActionReference()

  return action ? (
    <button
      id="forward-action"
      type="button"
      onClick={async () => {
        sessionStorage.setItem('action-status', 'started')
        try {
          sessionStorage.setItem('action-status', await action())
        } catch (error) {
          sessionStorage.setItem('action-status', `error: ${error}`)
        }
      }}
    >
      Ping
    </button>
  ) : null
}
