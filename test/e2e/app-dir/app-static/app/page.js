import { Button } from './button'

export default async function Page() {
  console.log('rendering index')

  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?page'
  ).then((res) => res.text())

  return (
    <>
      <p id="page">/</p>
      <p id="page-data">{data}</p>
      <p id="now">{Date.now()}</p>
      <Button />
    </>
  )
}
