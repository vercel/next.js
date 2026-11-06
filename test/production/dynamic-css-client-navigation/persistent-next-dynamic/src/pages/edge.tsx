import Link from 'next/link'
import styles from '../components/red.module.css'

export default function Home() {
  return (
    <>
      <h1 id="home">Home</h1>
      {/* Statically imports the CSS module that the persistent box also uses. */}
      <div id="page-box" className={styles.box} />
      <Link href="/other" id="to-other">
        /other
      </Link>
    </>
  )
}

export function getServerSideProps() {
  return { props: {} }
}

export const runtime = 'experimental-edge'
