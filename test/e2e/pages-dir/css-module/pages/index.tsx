import Link from 'next/link'
import { RedButton } from '../components/red-button'

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
      <Link href="/next-dynamic">/next-dynamic</Link>
      <Link href="/next-dynamic-edge">/next-dynamic-edge</Link>
      <Link href="/next-dynamic-no-ssr">/next-dynamic-no-ssr</Link>
      {/* RedButton should be imported to reproduce the issue */}
      <RedButton />
    </div>
  )
}
