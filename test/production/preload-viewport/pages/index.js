import Link from 'next/link'
import { useState } from 'react'

export default () => {
  const [href, setHref] = useState('/first')

  return (
    <div>
      <a href="#scroll-to-me" id="scroll-to-another">
        Scroll to another
      </a>
      <button onClick={() => setHref('/another')}>Click me</button>
      <Link href={href}>to{href}</Link>
      <div
        style={{
          height: 10000,
          width: 20,
          background: 'orange',
        }}
      />
      <p id="scroll-to-me">Hi 👋</p>
      <Link href="/another" id="link-another">
        to /another
      </Link>
    </div>
  )
}
