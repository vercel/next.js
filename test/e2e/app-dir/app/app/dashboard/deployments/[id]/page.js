import { use } from 'react'
import fs from 'fs'
import path from 'path'

async function getData({ params }) {
  const data = JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), 'app/dashboard/deployments/[id]/data.json')
    )
  )
  console.log('data.json', data)

  return {
    id: (await params).id,
  }
}

export default function DeploymentsPage(props) {
  console.log('rendering /dashboard/deployments/[id]')
  const data = use(getData(props))

  return (
    <>
      <p>hello from app/dashboard/deployments/[id]. ID is: {data.id}</p>
      <span id="my-env">{process.env.NEXT_PUBLIC_TEST_ID}</span>
      <span id="my-other-env">{`${process.env.NEXT_PUBLIC_TEST_ID}-suffix`}</span>
    </>
  )
}
