export default async function Page() {
  const randomAsyncNumber = await new Promise((resolve) => {
    setTimeout(() => {
      resolve(Math.random())
    }, 5000)
  })

  return (
    <div>
      <h1>foo</h1>
      <p>{randomAsyncNumber}</p>
    </div>
  )
}

export const revalidate = 0
