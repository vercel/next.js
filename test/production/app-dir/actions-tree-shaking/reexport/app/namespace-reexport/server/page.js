import * as actionMod from './actions'

export default function Page() {
  return (
    <div>
      <form>
        <input type="text" placeholder="input" />
        <button formAction={actionMod.sharedServerLayerAction}>submit</button>
      </form>
    </div>
  )
}
