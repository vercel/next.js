import { SideEffectsFalseComponentClient } from 'side-effects-false-dep/index-client'
import Nav from '../../nav'

export default function Page() {
  return (
    <div>
      <SideEffectsFalseComponentClient id="vendor-side-effects-false-client">
        side effects: false - client
      </SideEffectsFalseComponentClient>
      <Nav />
    </div>
  )
}
