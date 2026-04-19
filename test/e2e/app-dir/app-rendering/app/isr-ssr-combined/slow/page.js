import { use } from 'react'

async function getData() {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  return {
    message: 'hello from slow page',
    nowDuringBuild: Date.now(),
  }
}

export default function NestedPage(props) {
  const data = use(getData())
  return (
    <>
      <p id="slow-page-message">{data.message}</p>
      <p id="slow-page-now">{data.nowDuringBuild}</p>
    </>
  )
}
