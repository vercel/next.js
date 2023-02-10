import { use } from 'react'

async function getData() {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  return {
    message: 'hello from slow layout',
    nowDuringExecution: Date.now(),
  }
}

export default function gspLayout(props) {
  const data = use(getData())
  return (
    <>
      <h1 id="slow-layout-message">{data.message}</h1>
      <p id="slow-layout-now">{data.nowDuringExecution}</p>
      {props.children}
    </>
  )
}
