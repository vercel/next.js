import { cookies } from 'next/headers'

export default async function Page() {
  const redirectCookie = (await cookies()).get('redirect')
  return (
    <div>
      <div id="redirected-cookie">
        {redirectCookie ? redirectCookie.value : 'no-redirected-cookie'}
      </div>
      <div id="redirected">redirected</div>
    </div>
  )
}
