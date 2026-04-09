import styles from './with-css.module.css'
import stylesShared from './with-css-shared.module.css'

export default () => (
  <div className={styles.content}>
    <p className={stylesShared.test} id="with-css">
      With CSS
    </p>
  </div>
)
