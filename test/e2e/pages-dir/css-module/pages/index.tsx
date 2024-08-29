import Link from 'next/link'
import { RedButton } from '../components/red-button'

export default function Home() {
  return (
    <>
      <Link id="dynamic-import" href="/dynamic-import">
        /dynamic-import
      </Link>
      <Link
        id="variable-inserted-dynamic-import"
        href="/variable-inserted-dynamic-import"
      >
        /variable-inserted-dynamic-import
      </Link>
      <Link id="next-dynamic" href="/next-dynamic">
        /next-dynamic
      </Link>
      <Link
        id="variable-inserted-next-dynamic"
        href="/variable-inserted-next-dynamic"
      >
        /variable-inserted-next-dynamic
      </Link>
      {/* RedButton should be imported to be reproduced */}
      <RedButton />
    </>
  )
}
