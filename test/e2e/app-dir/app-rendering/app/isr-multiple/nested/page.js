import { use } from 'react'

export const revalidate = 1

async function getData() {
  return {
    message: 'hello from page',
    now: Date.now(),
  }
}

export default function NestedPage(props) {
  const data = use(getData())

  return (
    <>
      <p id="page-message">{data.message}</p>
      <p id="page-now">{data.now}</p>
    </>
  )
}
