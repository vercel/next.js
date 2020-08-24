import React from 'react'
import { useRouter } from 'next/router'
import sleep from '../../utils/sleep'

const Page = ({ world }) => {
  const router = useRouter()
  return (
    <>
      <h1>Page with server-side props</h1>
      <p>hello: {router.isFallback ? 'fallback' : world}</p>
    </>
  )
}

export async function getServerSideProps() {
  await sleep(3000)
  return {
    props: {
      world: 'world',
    },
  }
}

export default Page
