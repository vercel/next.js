import styles from './with-css-2.module.css'
import stylesShared from './with-css-shared.module.css'

const WithCss2 = () => (
  <div className={styles.content}>
    <p className={stylesShared.test}>With CSS</p>
  </div>
)

export default WithCss2
