import url from 'url'
import Link from 'next/link'

console.log(new url.URL('https://example.com'))

export default () => (
  <div>
    <Link href="/">Index Page</Link>
    <p>Another</p>
  </div>
)
