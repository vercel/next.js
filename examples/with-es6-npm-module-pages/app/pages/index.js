import Link from 'next/link'
import Welcome from 'my-components/Welcome'

export default () => (
  <div>
    <Welcome />
    <p>
      Hello World. <Link href='/about'>About</Link>
    </p>
  </div>
)
