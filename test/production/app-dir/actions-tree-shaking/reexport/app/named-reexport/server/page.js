import { sharedServerLayerAction } from './reexport-action'

export default function Page() {
  return (
    <div>
      <form>
        <input type="text" placeholder="input" />
        <button formAction={sharedServerLayerAction}>submit</button>
      </form>
    </div>
  )
}
