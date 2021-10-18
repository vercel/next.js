import Link from 'next/link'

if (typeof window === 'undefined') {
  import('nanoid').then((mod) => console.log(mod.nanoid()))
}

export default () => (
  <div>
    <Link href="/about">
      <a>About Page</a>
    </Link>
    <p className="index-page">Hello World</p>
  </div>
)
