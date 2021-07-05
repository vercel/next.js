import styles from './with-css.module.css'
import stylesShared from './with-css-shared.module.css'

const WithCss = () => (
  <div className={styles.content}>
    <p className={stylesShared.test}>With CSS</p>
  </div>
)

export default WithCss
