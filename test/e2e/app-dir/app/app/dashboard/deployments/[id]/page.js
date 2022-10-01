import { experimental_use as use } from 'react'

async function getData({ params }) {
  return {
    id: params.id,
  }
}

export default function DeploymentsPage(props) {
  const data = use(getData(props))

  return (
    <>
      <p>hello from app/dashboard/deployments/[id]. ID is: {data.id}</p>
    </>
  )
}
