import Box from './Box'
import styles from './lazy.module.css'

export default function Lazy() {
  return (
    <section className={styles.lazy} id="lazy-loaded">
      <Box />
    </section>
  )
}
