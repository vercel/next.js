import Link from 'next/link'

if (typeof window === 'undefined') {
  try {
    let file = 'clear.js'
    require('es5-ext/array/#/' + file)
  } catch (_) {}
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
