import Link from 'next/prefetch'
import restricted from '../components/restricted'

const RestrictedPage = () => (
  <div>
    <h1>Restricted page</h1>
    <p>This page is restricted to the public. Since you&#39;re logged in you see this message.</p>
    <Link href='/'><a>Back to homepage</a></Link>
  </div>
)

// restricted can only be used on top level components (routes inside the pages directory)
export default restricted(RestrictedPage)
