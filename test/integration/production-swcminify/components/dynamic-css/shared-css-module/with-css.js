import styles from './with-css.module.css'
import stylesShared from './with-css-shared.module.css'

export default () => (
  <div className={styles.content}>
    <p className={stylesShared.test}>With CSS</p>
  </div>
)
