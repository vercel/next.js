export const dynamic = 'force-dynamic'

function getData() {
  const res = new Promise((resolve) => {
    setTimeout(() => {
      resolve({ message: 'Layout Data!' })
    }, 1000)
  })
  return res
}

export default async function Layout({ children }) {
  const result = await getData()

  return (
    <div>
      <h1>Layout</h1>
      {children}
      <h3>{JSON.stringify(result)}</h3>
    </div>
  )
}
