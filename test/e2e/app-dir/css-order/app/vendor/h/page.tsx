import { SideEffectsComponentWithClientSubcomponent } from 'side-effects-dep/index-server-client'
import Nav from '../../nav'

export default function Page() {
  return (
    <div>
      <SideEffectsComponentWithClientSubcomponent id="vendor-side-effects-true-server-client-subcomponent">
        side effects: true - server component with client subcomponent
      </SideEffectsComponentWithClientSubcomponent>
      <Nav />
    </div>
  )
}
