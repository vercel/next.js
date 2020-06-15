import styles from './footer.module.css'

export default () => (
  <div className={styles.footer}>
    <hr/>
    <ul className={styles.navigation}>
      <li className={styles.navigationItem}><a href="https://github.com/iaincollins/next-auth-example">Source</a></li>
      <li className={styles.navigationItem}><a href="https://next-auth.js.org">Documentation</a></li>
    </ul>
  </div>
)