/* globals alert */

import Link from 'next/link'
import Button from '@kadira/react-button/src'

export default () => (
  <div>
    <p>
      Hello World. <Link href='/about'>About</Link>
    </p>

    <Button onClick={() => alert('Hello!')}>
      Say Hello
    </Button>
  </div>
)
