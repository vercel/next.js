/* Components */
import { Nav } from '@/app/components'

/* Instruments */
import styles from '@/app/styles/index-page.module.css'

export default function VerifyPage() {
  return (
    <div className={styles.container}>
      <Nav />

      <h1>Verify page</h1>
      <p>
        This page is intended to verify that Redux state is persisted across
        page navigations.
      </p>
    </div>
  )
}
