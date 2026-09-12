import { notFoundAction } from './actions'

export default function Page() {
  return (
    <form action={notFoundAction}>
      <button id="trigger-action">Trigger</button>
    </form>
  )
}
