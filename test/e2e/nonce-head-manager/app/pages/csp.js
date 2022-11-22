import React from 'react'
import Head from 'next/head'

const Page = () => {
  const [counter, setCounter] = React.useState(0)
  const [useSrc1, setUseSrc1] = React.useState(true)

  return (
    <>
      <Head>
        <script nonce="abc123" src={useSrc1 ? '/src-1.js' : '/src-2.js'} />
      </Head>
      <h1 id="h1">{'Count ' + counter}</h1>
      <button id="force-rerender" onClick={() => setCounter(counter + 1)}>
        Re-render
      </button>
      <button id="change-script" onClick={() => setUseSrc1(!useSrc1)}>
        Change script src
      </button>
    </>
  )
}

export default Page
