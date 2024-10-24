import { SideEffectsComponentClient } from 'side-effects-dep/index-client'
import Nav from '../../nav'

export default function Page() {
  return (
    <div>
      <SideEffectsComponentClient id="vendor-side-effects-true-client">
        side effects: true - client
      </SideEffectsComponentClient>
      <Nav />
    </div>
  )
}
