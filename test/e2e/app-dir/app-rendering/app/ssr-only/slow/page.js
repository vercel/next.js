import { use } from 'react'

let i
async function getData() {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  return {
    message: 'hello from slow page',
  }
}

export default function NestedPage(props) {
  // TODO-APP: refactor this test page to `async function` instead.
  if (!i) {
    i = getData()
  }
  const data = use(i)
  return (
    <>
      <p id="slow-page-message">{data.message}</p>
    </>
  )
}
