import { grantAccessAction } from '../actions'

export function GrantAccessButton() {
  return (
    <form action={grantAccessAction}>
      <button id="grant-access" type="submit">
        Grant Access
      </button>
    </form>
  )
}
