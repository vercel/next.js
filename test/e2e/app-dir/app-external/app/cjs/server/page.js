import { createResponse } from 'next-server-cjs-lib'

export default async function Page() {
  const response = createResponse('resolve response')
  const text = await response.text()
  return <p>{text}</p>
}
