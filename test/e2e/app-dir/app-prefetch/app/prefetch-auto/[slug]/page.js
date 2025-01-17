export const dynamic = 'force-dynamic'

function getData() {
  const res = new Promise((resolve) => {
    setTimeout(() => {
      resolve({ message: 'Page Data!' })
    }, 2000)
  })
  return res
}

export default async function Page(props) {
  const params = await props.params
  const result = await getData()

  return (
    <div id="prefetch-auto-page-data">
      <h3>{JSON.stringify(params)}</h3>
      <h3>{JSON.stringify(result)}</h3>
    </div>
  )
}
