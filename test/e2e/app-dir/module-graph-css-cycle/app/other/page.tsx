import styles from '../a.module.css'
import title from '../b.module.css'

export default function OtherPage() {
  return (
    <p id="other" className={`${styles.banner} ${title.title}`}>
      other
    </p>
  )
}
