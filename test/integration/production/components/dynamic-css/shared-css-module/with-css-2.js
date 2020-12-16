import * as styles from './with-css-2.module.css'
import * as stylesShared from './with-css-shared.module.css'

export default () => (
  <div className={styles.content}>
    <p className={stylesShared.text}>With CSS</p>
  </div>
)
