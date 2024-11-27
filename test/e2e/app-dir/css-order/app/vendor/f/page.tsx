import { SideEffectsArrayComponentWithClientSubcomponent } from 'side-effects-array-dep/index-client'
import Nav from '../../nav'

export default function Page() {
  return (
    <div>
      <SideEffectsArrayComponentWithClientSubcomponent id="vendor-side-effects-array-server-client-subcomponent">
        side effects: array - server component with client subcomponent
      </SideEffectsArrayComponentWithClientSubcomponent>
      <Nav />
    </div>
  )
}
