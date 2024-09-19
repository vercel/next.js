import { MyLink } from 'my-dep'
import { SideEffectsArrayComponent } from 'side-effects-array-dep'
import { SideEffectsComponent } from 'side-effects-dep'
import { SideEffectsFalseComponent } from 'side-effects-false-dep'
import styles from './page.module.css'
import Nav from '../nav'

export default function Page() {
  return (
    <div>
      <MyLink className={styles.my_button} id="vendor1">
        hello world
      </MyLink>
      <SideEffectsArrayComponent id="vendor-side-effects-array" />
      <SideEffectsComponent id="vendor-side-effect-true" />
      <SideEffectsFalseComponent id="vendor-side-effects-false" />
      <Nav />
    </div>
  )
}
