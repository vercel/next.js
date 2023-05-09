import { use } from 'react'

async function getData() {
  return {
    message: 'hello from layout',
    nowDuringExecution: Date.now(),
  }
}

export default function gspLayout(props) {
  const data = use(getData())

  return (
    <>
      <h1 id="layout-message">{data.message}</h1>
      <p id="layout-now">{data.nowDuringExecution}</p>
      {props.children}
    </>
  )
}
