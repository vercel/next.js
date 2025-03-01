import { use } from 'react'

async function getData() {
  return {
    message: 'hello from page',
  }
}

export default function NestedPage(props) {
  const data = use(getData())

  return (
    <>
      <p id="page-message">{data.message}</p>
    </>
  )
}
