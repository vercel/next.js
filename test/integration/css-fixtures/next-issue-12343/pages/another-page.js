import { Button } from '../components/button'
import Link from 'next/link'

function AnotherPage() {
  return (
    <div>
      <h1>Another page</h1>
      <Link href="/">
        <Button id="link-index">Another Button instance</Button>
      </Link>
    </div>
  )
}

export default AnotherPage
