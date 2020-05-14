import styles from /* webpackChunkName: 'with-css' */ './with-css.module.css'

export default () => (
  <p className={styles.content}>Rendered SSR with CSS bundle in static</p>
)
