import { logIn } from './actions'

export default function Page() {
  return (
    <main>
      <p id="logged-out">You are logged out</p>
      <form action={logIn}>
        <button id="log-in">Log in</button>
      </form>
    </main>
  )
}
