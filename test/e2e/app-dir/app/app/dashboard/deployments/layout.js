import { use } from 'react'

async function getData() {
  return {
    message: 'hello',
  }
}

export default function DeploymentsLayout({ children }) {
  const { message } = use(getData())

  return (
    <>
      <h2>Deployments {message}</h2>
      {children}
    </>
  )
}
