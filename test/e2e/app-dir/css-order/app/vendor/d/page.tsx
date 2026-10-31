import { SideEffectsArrayGlobalComponent } from 'side-effects-array-global-only-dep'
import Nav from '../../nav'

export default function Page() {
  return (
    <div>
      <SideEffectsArrayGlobalComponent id="vendor-side-effects-global-array">
        side effects: global css array
      </SideEffectsArrayGlobalComponent>
      <Nav />
    </div>
  )
}
