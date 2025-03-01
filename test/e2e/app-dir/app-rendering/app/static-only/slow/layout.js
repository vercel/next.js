import { use } from 'react'

async function getData() {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  return {
    message: 'hello from slow layout',
  }
}

export default function GspLayout(props) {
  const data = use(getData())

  return (
    <>
      <h1 id="slow-layout-message">{data.message}</h1>
      {props.children}
    </>
  )
}
