import Link from 'next/link'
import css from './other.module.css'

export default function Other() {
  return (
    <main>
      <Link href="/" prefetch={false} id="link-index">
        index page
      </Link>
      <br />
      <h1 id="red-title" className={css.root}>
        Red
      </h1>
    </main>
  )
}
