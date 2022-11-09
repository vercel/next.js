import { use } from 'react'

export const revalidate = 0

async function getData() {
  await new Promise((resolve) => setTimeout(resolve, 3000))
  return {
    message: 'Welcome to the dashboard',
  }
}
export default function DashboardPage(props) {
  const { message } = use(getData())

  return (
    <>
      <p id="dashboard-page">{message}</p>
    </>
  )
}
