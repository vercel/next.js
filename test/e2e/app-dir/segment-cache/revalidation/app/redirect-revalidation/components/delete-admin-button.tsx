import { revokeAccessAction } from '../actions'

export function RevokeAccessButton() {
  return (
    <form action={revokeAccessAction}>
      <button id="revoke-access" type="submit">
        Revoke Access
      </button>
    </form>
  )
}
