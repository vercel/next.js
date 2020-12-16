import * as styles from './with-css.module.css'
import * as stylesShared from './with-css-shared.module.css'

export default () => (
  <div className={styles.content}>
    <p className={stylesShared.text}>With CSS</p>
  </div>
)
