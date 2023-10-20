import Link from 'next/link'

console.log(new URL('https://example.com'))

export default () => (
  <div>
    <Link href="/">Index Page</Link>
    <p>Another</p>
  </div>
)
