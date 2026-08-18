import { redirectToTarget } from './actions'

export default function Page() {
  return (
    <form action={redirectToTarget}>
      <button>Redirect</button>
    </form>
  )
}
