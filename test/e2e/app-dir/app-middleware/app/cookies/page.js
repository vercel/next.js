import { cookies } from 'next/headers'

export default async function Page() {
  const cookieLength = (await cookies()).size
  return <div id="cookies">cookies: {cookieLength}</div>
}
