import { SideEffectsArrayGlobalComponentClient } from 'side-effects-array-global-only-dep/index-client'
import Nav from '../../nav'

export default function Page() {
  return (
    <div>
      <SideEffectsArrayGlobalComponentClient id="vendor-side-effects-global-array-client">
        side effects: global css array
      </SideEffectsArrayGlobalComponentClient>
      <Nav />
    </div>
  )
}
