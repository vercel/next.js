import { use } from 'react'

async function getData() {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  return {
    message: 'hello from slow layout',
  }
}

export default function SlowLayout(props) {
  const data = use(getData())

  return (
    <>
      <p id="slow-layout-message">{data.message}</p>
      {props.children}
    </>
  )
}
