import { SideEffectsComponent } from 'side-effects-dep'
import Nav from '../../nav'

export default function Page() {
  return (
    <div>
      <SideEffectsComponent id="vendor-side-effects-true">
        side effects: array
      </SideEffectsComponent>
      <Nav />
    </div>
  )
}
