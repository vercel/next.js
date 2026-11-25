import { SideEffectsArrayComponentClient } from 'side-effects-array-dep/index-client'
import Nav from '../../nav'

export default function Page() {
  return (
    <div>
      <SideEffectsArrayComponentClient id="vendor-side-effects-array-client">
        side effects: array - client components
      </SideEffectsArrayComponentClient>
      <Nav />
    </div>
  )
}
