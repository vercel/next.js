import { cookies } from 'next/dist/server/request/headers'

export default function Page() {
  const redirectCookie = cookies().get('redirect')
  return (
    <div>
      <div id="redirected-cookie">
        {redirectCookie ? redirectCookie.value : 'no-redirected-cookie'}
      </div>
      <div id="redirected">redirected</div>
    </div>
  )
}
