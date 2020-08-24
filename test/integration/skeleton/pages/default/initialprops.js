import React from 'react'
import { useRouter } from 'next/router'
import sleep from '../../utils/sleep'

const Page = ({ world }) => {
  const router = useRouter()
  return (
    <>
      <h1>Page with initial props</h1>
      <p>hello: {router.isFallback ? 'fallback' : world}</p>
    </>
  )
}

Page.getInitialProps = async () => {
  await sleep(3000)
  return {
    world: 'world',
  }
}

export default Page
