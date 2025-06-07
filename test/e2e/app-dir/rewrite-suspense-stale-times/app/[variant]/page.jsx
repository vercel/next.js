import Link from 'next/link'
import { SwitchVariant } from './SwitchVariant'

export default function Home() {
  return (
    <>
      <div id="home-page">Home Page</div>
      <SwitchVariant />
      <Link href="/other" id="link-to-other-page">
        To to other page
      </Link>
    </>
  )
}
