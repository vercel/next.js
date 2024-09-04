import Link from 'next/link'
import { RedButton } from '../components/red-button'
import { GreenButton } from '../components/green-button'

export default function Home() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '500px',
        gap: '10px',
      }}
    >
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
      <GreenButton />
    </div>
  )
}
