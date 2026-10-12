import { action } from './actions'

export default function Page() {
  return (
    <form action={action}>
      <button type="submit" id="submit">
        Submit
      </button>
    </form>
  )
}
