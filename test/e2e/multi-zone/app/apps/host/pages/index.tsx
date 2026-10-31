import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function Page() {
  const [date, setDate] = useState<Number>()

  useEffect(() => {
    setDate(Date.now())
  }, [])

  // this variable is edited by the test to verify HMR
  const editedContent = ''
  return (
    <>
      <p>hello from host app</p>
      <div>{editedContent}</div>
      <div id="now">{`${date}`}</div>
      <a id="visit-guest" href="/guest">
        Visit guest zone
      </a>
      <Link id="same-zone-blog" href="/blog/post-1" prefetch={false}>
        Host blog
      </Link>
    </>
  )
}
