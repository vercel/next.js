import { use } from 'react'

async function getData() {
  await new Promise((resolve) => setTimeout(resolve, 400))
  return {
    message: 'Hello World',
  }
}

export default function DashboardLayout({ children }) {
  const { message } = use(getData())

  return (
    <>
      <h1 id="dashboard-layout">Dashboard {message}</h1>
      {children}
    </>
  )
}
