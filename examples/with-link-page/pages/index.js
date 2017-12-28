import Link from 'next/link'

export default () => (
  <div>Hello World.
    <br />
    <Link page={import('./about.js')} href='/about'><a>About</a></Link>
    <br />
    <Link page={import('./contact.js')} href='/contact?map=1' prefetch><a>Contact</a></Link>
  </div>
)
