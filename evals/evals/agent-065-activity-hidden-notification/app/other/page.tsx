'use client'
import Link from 'next/link'
import { setMessageOnKeptPage } from '../kept-page-state'
export default function Other() {
  return (
    <>
      <h1 id="other-heading">Other page</h1>
      <button
        id="set-message"
        onClick={() => setMessageOnKeptPage('new notification')}
      >
        Deliver notification
      </button>
      <Link id="to-kept" href="/kept">
        Return
      </Link>
    </>
  )
}
