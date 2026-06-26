import styles from './with-css.module.css'
import Nested from './Nested'

export default () => (
  <div className={styles.content}>
    <Nested />
  </div>
)
