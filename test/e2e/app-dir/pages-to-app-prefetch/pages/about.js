import Link from 'next/link'
import { useState } from 'react'

export default function About() {
  const [showLink, setShowLink] = useState(false)
  return (
    <>
      <button id="show-link" onClick={() => setShowLink(true)}>
        Show link
      </button>
      {showLink && (
        <Link id="app-link" href="/dashboard">
          To dashboard
        </Link>
      )}
    </>
  )
}

export function getStaticProps() {
  return { props: {} }
}
