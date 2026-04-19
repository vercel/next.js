import { sharedServerLayerAction } from '../actions'

export default function Page() {
  return (
    <div>
      <h3>One</h3>
      <form>
        <input type="text" placeholder="input" />
        <button formAction={sharedServerLayerAction}>submit</button>
      </form>
    </div>
  )
}
