import Link from 'next/link'
import { BeforeUnloadToggle } from './before-unload-toggle'

export default function PageA() {
  return (
    <>
      <h1 id="page-a">Page A</h1>
      {/* /b has a different root layout, so this is a hard navigation */}
      <Link id="to-b" href="/b">
        To /b
      </Link>
      <BeforeUnloadToggle />
    </>
  )
}
