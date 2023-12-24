import { use } from 'react'

async function getData({ params }) {
  return {
    now: Date.now(),
    params,
  }
}

export default function Page(props) {
  const data = use(getData(props))

  return (
    <>
      <p>/dashboard/project/[projectId]</p>
      <p id="props">{JSON.stringify(data)}</p>
    </>
  )
}
