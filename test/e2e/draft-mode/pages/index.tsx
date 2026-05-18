import { useState } from 'react'
import Link from 'next/link'
import type { GetStaticProps } from 'next'

type Props = {
  random: number
  draftMode: string
}

export const getStaticProps: GetStaticProps<Props> = ({ draftMode }) => {
  return {
    props: {
      random: Math.random(),
      draftMode: Boolean(draftMode).toString(),
    },
    revalidate: 100000,
  }
}

export default function Home(props: Props) {
  const [count, setCount] = useState(0)
  return (
    <>
      <h1>Home</h1>
      <p>
        Draft Mode: <em id="draft">{props.draftMode}</em>
      </p>
      <button id="inc" onClick={() => setCount(count + 1)}>
        Increment
      </button>
      <p>
        Count: <span id="count">{count}</span>
      </p>
      <p>
        Random: <em id="rand">{props.random}</em>
      </p>
      <Link href="/another">Visit another page</Link>
    </>
  )
}
