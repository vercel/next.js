import { use } from 'react'

let i

async function getData() {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  return {
    message: 'hello from slow layout',
  }
}

export default function gsspLayout(props) {
  // TODO-APP: refactor this test page to `async function` instead.
  if (!i) {
    i = getData()
  }
  const data = use(i)
  return (
    <>
      <h1 id="slow-layout-message">{data.message}</h1>
      {props.children}
    </>
  )
}
