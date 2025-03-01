import { MyLink } from 'my-dep'
import styles from './page.module.css'
import Nav from '../nav'

export default function Page() {
  return (
    <div>
      <MyLink className={styles.my_button} id="vendor1">
        hello world
      </MyLink>
      <Nav />
    </div>
  )
}
