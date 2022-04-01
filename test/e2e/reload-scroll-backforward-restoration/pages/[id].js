import { useState, useEffect } from 'react'
import Link from 'next/link'

const Page = ({ id }) => {
  const [hydrate, setHydrate] = useState(false)
  useEffect(() => {
    setHydrate(true)
  }, [hydrate, setHydrate])

  return (
    <>
      <div
        style={{
          width: 10000,
          height: 10000,
          background: 'blue',
        }}
      />
      <p>{hydrate ? 'hydrated' : 'loading'}</p>
      <Link href={`/${id + 1}`}>
        <a
          id="link"
          style={{
            marginLeft: 5000,
            width: 95000,
            display: 'block',
          }}
        >
          next page
        </a>
      </Link>
      <div id="end-el">hello, world</div>
    </>
  )
}

export default Page

export const getServerSideProps = (context) => {
  const { id = 0 } = context.query
  return {
    props: {
      id,
    },
  }
}
