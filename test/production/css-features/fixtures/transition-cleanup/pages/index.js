import Link from 'next/link'
import css from './index.module.css'

export default function Home() {
  return (
    <main>
      <Link href="/other" id="link-other">
        other
      </Link>
      <br />
      <h1 id="black-title" className={css.header}>
        Black
      </h1>
    </main>
  )
}

export function getServerSideProps() {
  return { props: {} }
}
