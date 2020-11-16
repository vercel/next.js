import Link from 'next/link'
import css from './index.module.css'

export default function Home() {
  return (
    <main>
      <Link href="/other" prefetch={false}>
        <a id="link-other">other page</a>
      </Link>
      <h1 id="green-title" className={css.green}>
        Green
      </h1>
    </main>
  )
}
