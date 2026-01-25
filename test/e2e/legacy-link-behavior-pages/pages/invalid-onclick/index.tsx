import Link from 'next/link'
import { useState } from 'react'

export default function Page(props: any) {
  const [errorCount, setErrorCount] = useState(0)

  function Button(props) {
    return (
      <a
        id="custom-button"
        href={props.href}
        onClick={(e) => {
          e.preventDefault()
          try {
            props.onClick()
          } catch (err) {
            setErrorCount(errorCount + 1)
            console.error(err)
          }
        }}
      >
        {props.href}
      </a>
    )
  }

  return (
    <>
      <p id="errors">{errorCount}</p>
      <Link href="/nav" passHref legacyBehavior>
        <Button />
      </Link>
    </>
  )
}
