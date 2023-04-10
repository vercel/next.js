'use client'
import React from 'react'
import Image from 'next/image'

const Page = () => {
  const [count, setCount] = React.useState(0)
  return (
    <>
      <h1>Warning should print at most once</h1>
      <Image id="w" src="/test.png" width="400" height="400" sizes="50vw" />
      <button onClick={() => setCount(count + 1)}>Count: {count}</button>
      <footer>footer here</footer>
    </>
  )
}

export default Page
