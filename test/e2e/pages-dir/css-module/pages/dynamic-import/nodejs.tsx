import Link from 'next/link'
import { RedButton } from '../../components/red-button'
import { RedButtonLazy } from '../../components/red-button-lazy'

export default function Home() {
  return (
    <>
      <Link href="/dynamic-import/basic">/dynamic-import/basic</Link>
      {/* Both RedButton and RedButtonLazy should be imported to reproduce the issue */}
      <RedButton />
      <RedButtonLazy />
    </>
  )
}
