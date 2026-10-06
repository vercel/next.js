import { SideEffectsFalseComponent } from 'side-effects-false-dep'
import Nav from '../../nav'

export default function Page() {
  return (
    <div>
      <SideEffectsFalseComponent id="vendor-side-effects-false">
        side effects: false
      </SideEffectsFalseComponent>
      <Nav />
    </div>
  )
}
