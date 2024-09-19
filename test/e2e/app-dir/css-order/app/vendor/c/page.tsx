import { SideEffectsFalseComponent } from 'side-effects-false-dep'
import Nav from '../../nav'

export default function Page() {
  return (
    <div>
      <SideEffectsFalseComponent id="vendor-side-effects-false">
        side effects: array
      </SideEffectsFalseComponent>
      <Nav />
    </div>
  )
}
