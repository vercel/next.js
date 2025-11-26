import { MyLink } from 'my-dep'
import { MyContainer } from 'my-dep2'
import styles from './page.module.css'
import Nav from '../nav'

export default function Page() {
  return (
    <div>
      <MyContainer className={styles.my_container}>
        <MyLink className={styles.my_button} id="vendor1">
          hello world
        </MyLink>
      </MyContainer>
      <Nav />
    </div>
  )
}
