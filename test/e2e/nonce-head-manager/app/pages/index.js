import React from 'react'
import Script from 'next/script'

const Page = () => {
  const [counter, setCounter] = React.useState(0)
  const [useSrc1, setUseSrc1] = React.useState(true)

  return (
    <>
      <Script nonce="abc123" src={useSrc1 ? '/src-1.js' : '/src-2.js'} />
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
