import React from 'react'
import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="https://vercel.com/">
        <a id="absolute-link">https://vercel.com/</a>
      </Link>
      <br />
      <Link href="mailto:idk@idk.com">
        <a id="mailto-link">mailto:idk@idk.com</a>
      </Link>
    </>
  )
}
