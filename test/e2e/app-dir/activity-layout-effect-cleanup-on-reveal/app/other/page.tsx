'use client'

import Link from 'next/link'
import { setMessageOnKeptPage } from '../kept-page-state'

export default function OtherPage() {
  return (
    <>
      <h1 id="other-heading">other</h1>
      <button
        id="set-message"
        onClick={() => setMessageOnKeptPage('set-while-hidden')}
      >
        set message on the hidden kept page
      </button>
      <Link id="to-kept" href="/kept">
        to kept
      </Link>
    </>
  )
}
