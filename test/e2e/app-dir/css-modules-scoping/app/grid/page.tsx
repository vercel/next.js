import styles from './grid.module.css'
export default function Page() {
  return (
    <div className={styles['grid-container']}>
      <div id="header" className={`${styles['grid-item']} ${styles['header']}`}>
        Header
      </div>
      <div
        id="sidebar"
        className={`${styles['grid-item']} ${styles['sidebar']}`}
      >
        Sidebar
      </div>
      <div id="main" className={`${styles['grid-item']} ${styles['main']}`}>
        Main
      </div>
      <div id="footer" className={`${styles['grid-item']} ${styles['footer']}`}>
        Footer
      </div>
    </div>
  )
}
