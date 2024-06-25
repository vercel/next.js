import { RedirectForm } from '../components/RedirectForm'
import { redirectAction } from '../actions'

export default function Page() {
  return (
    <div>
      <h1>Page</h1>

      <br />

      <RedirectForm action={redirectAction} />
    </div>
  )
}
