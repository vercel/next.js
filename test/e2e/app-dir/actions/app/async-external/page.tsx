import { submit } from './actions'

export default function Page() {
  return (
    <form action={submit}>
      <button id="submit" type="submit">
        Submit
      </button>
    </form>
  )
}
