import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default function Page() {
  const foo = cookies().get('foo')
  const bar = cookies().get('bar')
  return (
    <div>
      <h1>
        foo={foo ? foo.value : ''}; bar={bar ? bar.value : ''}
      </h1>
      <form
        action={async () => {
          'use server'
          cookies().delete('foo')
          cookies().set('bar', '2')
          redirect('/redirects/action-redirect/redirect-target')
        }}
      >
        <button type="submit" id="redirect-with-cookie-mutation">
          Set Cookies and Redirect
        </button>
      </form>
    </div>
  )
}
