import Link from 'next/link'
import { nanoid } from 'nanoid'

console.log(nanoid())

export default () => (
  <div>
    <Link href="/about">
      <a>About Page</a>
    </Link>
    <p className="index-page">Hello World</p>
  </div>
)
