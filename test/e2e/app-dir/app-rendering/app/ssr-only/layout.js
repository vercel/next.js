import { use } from 'react'

export const revalidate = 0

async function getData() {
  return {
    message: 'hello from layout',
  }
}

export default function GsspLayout(props) {
  const data = use(getData())

  return (
    <>
      <h1 id="layout-message">{data.message}</h1>
      {props.children}
    </>
  )
}
