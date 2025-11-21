import Head from 'next/head'
import React from 'react'

function Foo() {
  const [displayed, toggle] = React.useState(true)

  return (
    <>
      {displayed ? (
        <Head>
          <title>B</title>
        </Head>
      ) : null}
      <button onClick={() => toggle(!displayed)}>toggle</button>
    </>
  )
}

export default () => {
  return (
    <>
      <Head>
        <title>A</title>
      </Head>
      <Foo />
    </>
  )
}
