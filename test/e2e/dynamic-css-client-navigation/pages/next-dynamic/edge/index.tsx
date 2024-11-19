import Link from 'next/link'
import { RedButton } from '../../../components/red-button'

export default function Home() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        width: '400px',
      }}
    >
      <Link href="/next-dynamic/basic">/next-dynamic/basic</Link>
      <Link href="/next-dynamic/ssr-false">/next-dynamic/ssr-false</Link>
      <Link href="/next-dynamic/on-demand">/next-dynamic/on-demand</Link>
      {/* RedButton should be imported to reproduce the issue */}
      <RedButton />
    </div>
  )
}

export const config = {
  runtime: 'experimental-edge',
}
