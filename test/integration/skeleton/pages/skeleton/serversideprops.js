import React from 'react'
import { useRouter } from 'next/router'
import sleep from '../../utils/sleep'

export const config = {
  skeleton: true,
}

const Page = ({ world }) => {
  const router = useRouter()
  return (
    <>
      <h1>Page with server-side props</h1>
      <p>
        hello <span id="world">{world}</span>
      </p>
      {router.isFallback ? (
        <div id="fallback">loading...</div>
      ) : (
        <div id="done">done</div>
      )}
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
