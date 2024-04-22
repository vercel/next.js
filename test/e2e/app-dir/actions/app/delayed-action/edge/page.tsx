import Link from 'next/link'
import { Button } from '../button'

export default function Page() {
  return (
    <>
      <div>
        <Link href="/delayed-action/edge/other">Navigate to Other Page</Link>
      </div>
      <div>
        <Button />
      </div>
    </>
  )
}
