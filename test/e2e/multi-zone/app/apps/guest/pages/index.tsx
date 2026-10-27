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
      <p>hello from guest app</p>
      <div>{editedContent}</div>
      <div id="now">{`${date}`}</div>
      <a id="visit-host" href="/">
        Visit host zone
      </a>
      <Link id="same-zone-blog" href="/blog/post-1" prefetch={false}>
        Guest blog
      </Link>
    </>
  )
}
