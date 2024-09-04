import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default function Page({ searchParams }) {
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
      <h2>baz={searchParams.baz ?? ''}</h2>
      <form
        action={async () => {
          'use server'
          redirect('/redirects/action-redirect/redirect-target?baz=1')
        }}
      >
        <button type="submit" id="redirect-with-search-params">
          Redirect with SearchParams
        </button>
      </form>
    </div>
  )
}
