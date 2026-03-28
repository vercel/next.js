import Link from 'next/link'
import shared1 from '../styles/shared1.module.css'
import uniqueB from '../styles/unique-b.module.css'
import shared2 from '../styles/shared2.module.css'
import uniqueBFinal from '../styles/unique-b-final.module.css'

export default function PageB() {
  return (
    <>
      <div
        id="target"
        className={`${shared1.target} ${uniqueB.target} ${shared2.target} ${uniqueBFinal.target}`}
      >
        Page B
      </div>
      <Link href="/a">Go to A</Link>
    </>
  )
}
