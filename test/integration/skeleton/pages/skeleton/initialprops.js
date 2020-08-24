import React from 'react'
import { useRouter } from 'next/router'
import sleep from '../../utils/sleep'

const Page = ({ world }) => {
  const router = useRouter()
  return (
    <>
      <h1>Page with initial props</h1>
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

Page.getInitialProps = async () => {
  await sleep(3000)
  return {
    world: 'world',
  }
}

Page.skeleton = true

export default Page
