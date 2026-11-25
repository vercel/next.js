import { Trap } from 'sidecar-lib'
import { Widget } from 'side-effectful-lib'

export default function Page() {
  return (
    <>
      <p id="sidecar-lib-effects">
        <Trap />
      </p>
      <p id="side-effectful-lib-effects">
        <Widget />
      </p>
    </>
  )
}
