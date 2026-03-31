import styles from './with-css.module.css'
import styles2 from './with-css-2.module.css'

export default () => (
  <div className={styles.content}>
    <p className={styles2.text}>With CSS</p>
  </div>
)
