import { SideEffectsArrayComponent } from 'side-effects-array-dep'
import Nav from '../../nav'

export default function Page() {
  return (
    <div>
      <SideEffectsArrayComponent id="vendor-side-effects-array">
        side effects: array
      </SideEffectsArrayComponent>
      <Nav />
    </div>
  )
}
