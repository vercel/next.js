import { use } from 'react'

export const revalidate = false

async function getData() {
  return {
    message: 'hello from page',
  }
}

export default function nestedPage(props) {
  const data = use(getData())
  return (
    <>
      <p id="page-message">{data.message}</p>
    </>
  )
}
