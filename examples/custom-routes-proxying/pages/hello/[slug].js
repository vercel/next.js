import Link from 'next/link'
import { useRouter } from 'next/router'

export default function About() {
  return (
    <div>
      <h3>This is the `hello/[slug]` page. slug: {useRouter().query.slug}</h3>
      <Link href="/">
        <a> &larr; Back home</a>
      </Link>
    </div>
  )
}
