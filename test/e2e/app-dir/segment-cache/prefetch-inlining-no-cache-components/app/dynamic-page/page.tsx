import { cookies } from 'next/headers'

export default async function DynamicPage() {
  // Force dynamic rendering by reading cookies
  await cookies()
  return (
    <>
      <p id="page-dynamic">Dynamic page</p>
      <p id="page-dynamic-value">{Math.random()}</p>
    </>
  )
}
