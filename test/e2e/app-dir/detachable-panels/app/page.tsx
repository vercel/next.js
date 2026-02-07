import { headers } from 'next/headers'
export default async function PostPage() {
  const headersList = await headers()

  return <div className="">{JSON.stringify(headersList)}</div>
}
