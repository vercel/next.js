import React from 'react'
import { useRouter } from 'next/router'
import sleep from '../../../utils/sleep'

const Page = ({ world }) => {
  const router = useRouter()
  return (
    <>
      <h1>Page with static props</h1>
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

Page.skeleton = true

export const getStaticProps = async () => {
  await sleep(3000)
  return {
    props: {
      world: 'world',
    },
  }
}

export const getStaticPaths = async () => {
  return {
    paths: [],
    fallback: true,
  }
}

export default Page
