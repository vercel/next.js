import Link from 'next/link'
import { RedButton } from '../../components/red-button'

export default function Home() {
  return (
    <>
      <Link href="/next-dynamic/basic">/next-dynamic/basic</Link>
      <Link href="/next-dynamic/ssr-false">/next-dynamic/ssr-false</Link>
      <Link href="/next-dynamic/on-demand">/next-dynamic/on-demand</Link>
      {/* RedButton should be imported to reproduce the issue */}
      <RedButton />
    </>
  )
}
