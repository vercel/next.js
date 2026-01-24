'use client'

import { useActionState } from 'react'
import { DEFAULT_MESSAGE } from './const'
import { ORIGIN_DOMAIN, CONFIG_ALLOWED_ORIGINS } from '../domain'

export function ClientForm({ action }) {
  const [state, formAction, isPending] = useActionState(action, null)

  return (
    <>
      <form action={formAction} style={{ marginBottom: '20px' }}>
        <p style={{ marginBottom: '10px', fontWeight: 'bold' }}>
          If you submit this form,
          <br />
          you can check if the server action allowedOrigins validation is
          case-insensitive
        </p>
        <p>Current Origin: {ORIGIN_DOMAIN}</p>
        <p>Current Allowed Origins: {CONFIG_ALLOWED_ORIGINS.join(', ')}</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            name="message"
            defaultValue={DEFAULT_MESSAGE}
            readOnly
            style={{ flex: 1, maxWidth: '300px' }}
          />
          <button id="submit-button" type="submit" disabled={isPending}>
            {isPending ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </form>
      <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>Result:</div>
      <div id="result-status">
        {state ? (state.success ? 'Success' : 'Failure') : '(empty)'}
      </div>
      <div style={{ fontWeight: 'bold', margin: '5px 0' }}>
        Server Action executed successfully with the message:{' '}
      </div>
      <div id="result-message">{state ? state.message : '(empty)'}</div>
    </>
  )
}
