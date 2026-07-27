import Link from 'next/link'
import { Button } from '../components/button'
import styles from './homepage.module.css'

function HomePage() {
  return (
    <div>
      <h1>Home page</h1>
      <Link href="/another-page">
        <Button id="link-other" className={styles.button}>
          Another page
        </Button>
      </Link>
    </div>
  )
}

export default HomePage
