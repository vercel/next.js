import styles from './page.module.css'
import other from './other.module.scss'

export default function Page() {
  return (
    <div>
      <p className={styles.main}>hello world</p>
      <span className={other.other}>hello world</span>
    </div>
  )
}
