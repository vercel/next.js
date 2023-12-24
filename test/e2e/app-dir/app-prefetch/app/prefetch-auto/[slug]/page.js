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
  const result = await getData()

  return (
    <>
      <h3>{JSON.stringify(params)}</h3>
      <h3>{JSON.stringify(result)}</h3>
    </>
  )
}
