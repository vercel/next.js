/* Core */
import type { NextPage } from 'next'

/* Components */
import { Nav } from '@/components'

/* Instruments */
import styles from '@/styles/Home.module.css'

const VerifyPage: NextPage = () => {
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

export default VerifyPage
