import { useRef, useEffect, useState } from 'react'
import Link from 'next/link'

export default function Page() {
  const ref = useRef<HTMLAnchorElement>()
  const [anchorText, setAnchorText] = useState(null)

  useEffect(() => {
    const anchorElement = ref.current
    setAnchorText(anchorElement?.textContent)
  }, [])

  return (
    <>
      {anchorText && <h1 id="anchor-text">AnchorText: {anchorText}</h1>}
      <Link href="/about" ref={ref}>
        About
      </Link>
    </>
  )
}
