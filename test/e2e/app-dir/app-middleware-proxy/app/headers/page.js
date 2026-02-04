import { headers } from 'next/headers'

export default async function SSRPage() {
  const headersObj = Object.fromEntries(await headers())
  return (
    <>
      <p>app-dir</p>
      <p id="headers">{JSON.stringify(headersObj)}</p>
    </>
  )
}
