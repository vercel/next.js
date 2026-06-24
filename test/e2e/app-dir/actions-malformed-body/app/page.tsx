import { echo } from './actions'

// Binding the action directly to a form makes React render the action id into
// the page (as a `$ACTION_ID_<hash>` hidden field) for progressive
// enhancement. The tests scrape that id so they can POST a malformed body to a
// *recognized* action.
export default function Page() {
  return (
    <form action={echo}>
      <input name="value" defaultValue="hi" />
      <button type="submit">Submit</button>
    </form>
  )
}
