import { RedirectForm } from '../../components/RedirectForm'
import { redirectAction } from '../../actions'

export default function Page() {
  return (
    <dialog open>
      <h1>Modal</h1>

      <br />

      <RedirectForm action={redirectAction} />
    </dialog>
  )
}
