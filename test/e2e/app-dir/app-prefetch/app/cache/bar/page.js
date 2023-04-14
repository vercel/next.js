export default async function Page() {
  const randomAsyncNumber = await new Promise((resolve) => {
    setTimeout(() => {
      resolve(Math.random())
    }, 1000)
  })

  return (
    <div>
      <h1>bar</h1>
      <p>{randomAsyncNumber}</p>
    </div>
  )
}

export const revalidate = 0
