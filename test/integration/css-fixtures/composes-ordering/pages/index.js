import Link from 'next/link'
import css from './index.module.css'

export default function Home() {
  return (
    <main>
      <Link href="/other" prefetch={false}>
        <a id="link-other">other</a>
      </Link>
      <br />
      <h1 id="black-title" className={css.header}>
        Black
      </h1>
    </main>
  )
}
