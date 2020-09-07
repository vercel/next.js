import styles from './with-css-2.module.css'
import stylesShared from './with-css-shared.module.css'

export default () => (
  <div className={styles.content}>
    <p className={stylesShared.test}>With CSS</p>
  </div>
)
