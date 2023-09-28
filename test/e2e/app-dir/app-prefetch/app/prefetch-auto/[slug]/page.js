import { headers } from 'next/headers'

export const dynamic = 'force-dynamic'

function getData() {
  const res = new Promise((resolve) => {
    setTimeout(() => {
      resolve({ message: 'Hello World!' })
    }, 2000)
  })
  return res
}

export default async function Page({ params }) {
  const myHeaders = headers()
  const result = await getData()

  console.log('did full data load')

  return (
    <>
      <h1>{myHeaders.get('next-router-prefetch')}</h1>
      <h3>{JSON.stringify(params)}</h3>
      <h3>{JSON.stringify(result)}</h3>
    </>
  )
}
