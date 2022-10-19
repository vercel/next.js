import { headers } from 'next/headers'

export default function SSRPage() {
  return (
    <>
      <p id="headers">{JSON.stringify(headers())}</p>
    </>
  )
}
