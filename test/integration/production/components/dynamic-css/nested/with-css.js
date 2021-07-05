import styles from './with-css.module.css'
import Nested from './Nested'

const WithCss = () => (
  <div className={styles.content}>
    <Nested />
  </div>
)

export default WithCss
