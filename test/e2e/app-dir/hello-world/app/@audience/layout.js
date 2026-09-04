'use client'
import * as React from 'react'
import Link from 'next/link'

export default function AudienceLayout({ children }) {
  React.useEffect(() => {
    console.log('mount')
  }, [])

  return (
    <fieldset>
      <legend>app/@audience/layout</legend>
      <ul>
        <li>
          <Link href="/">home</Link>
        </li>
        <li>
          <Link href="/one">one</Link>
        </li>
        <li>
          <Link href="/two">two</Link>
        </li>
      </ul>
      {children}
    </fieldset>
  )
}
