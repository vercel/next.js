'use client'
import React from 'react'
import Link from 'next/link'

export default function IndexPage() {
  return (
    <div>
      On client
      <Link href={'/en/testing/test'} prefetch={false}>
        To /en/testing/test
      </Link>
    </div>
  )
}
