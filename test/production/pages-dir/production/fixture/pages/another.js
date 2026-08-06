import url from 'url'
import Link from 'next/link'

// `url` is shimmed partially by Next.js in the browser so we have to test a method
// that's not deprected in Node.js but also available in the shim.
console.log(url.resolve('/one/two/three', 'four'))

export default () => (
  <div>
    <Link href="/">Index Page</Link>
    <p>Another</p>
  </div>
)
