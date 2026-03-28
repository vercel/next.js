import Link from 'next/link'
import shared1 from '../styles/shared1.module.css'
import uniqueA from '../styles/unique-a.module.css'
import shared2 from '../styles/shared2.module.css'
import uniqueAFinal from '../styles/unique-a-final.module.css'

export default function PageA() {
  return (
    <>
      <div
        id="target"
        className={`${shared1.target} ${uniqueA.target} ${shared2.target} ${uniqueAFinal.target}`}
      >
        Page A
      </div>
      <Link href="/b">Go to B</Link>
    </>
  )
}
