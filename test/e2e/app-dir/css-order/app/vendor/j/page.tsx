import { SideEffectsFalseComponentWithClientSubcomponent } from 'side-effects-false-dep/index-server-client'
import Nav from '../../nav'

export default function Page() {
  return (
    <div>
      <SideEffectsFalseComponentWithClientSubcomponent id="vendor-side-effects-false-server-client-subcomponent">
        side effects: false - server component with client subcomponent
      </SideEffectsFalseComponentWithClientSubcomponent>
      <Nav />
    </div>
  )
}
