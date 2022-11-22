import React from 'react'
import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="https://vercel.com/" id="absolute-link">
        https://vercel.com/
      </Link>
      <br />
      <Link href="mailto:idk@idk.com" id="mailto-link">
        mailto:idk@idk.com
      </Link>
    </>
  )
}
