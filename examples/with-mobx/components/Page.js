import Link from 'next/link'
import Clock from './Clock'

export default function Page({ title, linkTo }) {
  return (
    <>
      <h1>{title}</h1>
      <Clock />
      <nav>
        <Link href={linkTo}>
          <a>Navigate</a>
        </Link>
      </nav>
    </>
  )
}
