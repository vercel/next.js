import { logIn } from './actions'

export default function Page() {
  return (
    <div>
      <p id="signed-out">Click to sign in</p>
      <form action={logIn}>
        <button id="log-in" type="submit">
          Log in
        </button>
      </form>
    </div>
  )
}
