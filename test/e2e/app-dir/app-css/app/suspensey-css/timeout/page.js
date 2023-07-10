'use client'

import Link from 'next/link'
import { useEffect } from 'react'

import './style.css'

export default function Page() {
  useEffect(() => {
    console.log(
      (window.__log =
        'background = ' +
        window.getComputedStyle(document.body).backgroundColor)
    )
  }, [])

  return (
    <div>
      <Link href="/suspensey-css">Get back</Link>
    </div>
  )
}
