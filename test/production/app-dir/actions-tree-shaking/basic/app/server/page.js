import { serverComponentAction } from '../actions'

export default function Page() {
  return (
    <form>
      <input type="text" placeholder="input" />
      <button formAction={serverComponentAction}>submit</button>
    </form>
  )
}
