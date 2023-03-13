import { headers } from 'next/headers'

export default function SSRPage() {
  const headersObj = Object.fromEntries(headers())
  return (
    <>
      <p>app-dir</p>
      <p id="headers">{JSON.stringify(headersObj)}</p>
    </>
  )
}
