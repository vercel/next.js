import { SideEffectsArrayGlobalComponentWithClientSubcomponent } from 'side-effects-array-global-only-dep/index-server-client'
import Nav from '../../nav'

export default function Page() {
  return (
    <div>
      <SideEffectsArrayGlobalComponentWithClientSubcomponent id="vendor-side-effects-global-array-server-client">
        side effects: global css array - server component with client
        subcomponent
      </SideEffectsArrayGlobalComponentWithClientSubcomponent>
      <Nav />
    </div>
  )
}
