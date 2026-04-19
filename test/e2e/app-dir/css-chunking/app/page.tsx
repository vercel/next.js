import styles from './page.module.css'
import InnerWrapper from '../components/inner-wrapper'
import Link from 'next/link'

export default function Home() {
  return (
    <div className={styles.page}>
      <InnerWrapper>
        <h1 className={styles.h1}>Home Page</h1>
        <Link href="./other" prefetch={false}>
          Other page
        </Link>
      </InnerWrapper>
    </div>
  )
}
