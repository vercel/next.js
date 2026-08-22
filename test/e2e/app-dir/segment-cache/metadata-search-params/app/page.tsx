'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function Home() {
  const [linksAreVisible, setLinksAreVisible] = useState(false)
  return (
    <>
      <input
        type="checkbox"
        checked={linksAreVisible}
        onChange={() => setLinksAreVisible(!linksAreVisible)}
        data-prefetch-links
      />
      {linksAreVisible ? (
        <ul>
          <li>
            <Link href="/search?q=alpha">alpha</Link>
          </li>
          <li>
            <Link href="/search?q=beta">beta</Link>
          </li>
        </ul>
      ) : null}
    </>
  )
}
