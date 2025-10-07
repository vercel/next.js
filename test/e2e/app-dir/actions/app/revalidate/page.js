import { revalidatePath, updateTag } from 'next/cache'
import { redirect } from 'next/navigation'
import Link from 'next/link'

import { cookies } from 'next/headers'
import RedirectClientComponent from './client'

export default async function Page() {
  const cookie = (await cookies()).get('random')
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?page',
    {
      next: { revalidate: 3600, tags: ['thankyounext'] },
    }
  ).then((res) => res.text())

  const data2 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?a=b',
    {
      next: { revalidate: 3600, tags: ['thankyounext', 'justputit'] },
    }
  ).then((res) => res.text())

  return (
    <>
      <h1 id="title">revalidate</h1>
      <p>
        {' '}
        revalidate (tags: thankyounext): <span id="thankyounext">
          {data}
        </span>{' '}
        <span>
          <Link href="/revalidate-2" id="another">
            /revalidate-2
          </Link>
        </span>
      </p>
      <p>
        revalidate (tags: thankyounext, justputit):{' '}
        <span id="justputit">{data2}</span>
      </p>
      <p>
        random cookie:{' '}
        <span id="random-cookie">{JSON.stringify({ cookie })}</span>
      </p>
      <form>
        <button
          id="set-cookie"
          formAction={async () => {
            'use server'
            ;(await cookies()).set('random', `${Math.random()}`)
          }}
        >
          set cookie
        </button>
      </form>
      <form>
        <button
          id="revalidate-thankyounext"
          formAction={async () => {
            'use server'
            updateTag('thankyounext')
          }}
        >
          revalidate thankyounext
        </button>
      </form>
      <form>
        <button
          id="revalidate-justputit"
          formAction={async () => {
            'use server'
            updateTag('justputit')
          }}
        >
          revalidate justputit
        </button>
      </form>
      <form>
        <button
          id="revalidate-path"
          formAction={async () => {
            'use server'
            revalidatePath('/revalidate')
          }}
        >
          revalidate path
        </button>
      </form>
      <form>
        <button
          id="revalidate-path-redirect"
          formAction={async () => {
            'use server'
            updateTag('justputit')
            redirect('/revalidate')
          }}
        >
          revalidate justputit + redirect
        </button>
      </form>
      <form>
        <button
          id="redirect"
          formAction={async () => {
            'use server'
            redirect('/revalidate')
          }}
        >
          redirect
        </button>
      </form>
      <form>
        <button
          id="redirect-revalidate"
          formAction={async () => {
            'use server'
            updateTag('justputit')
            redirect('/revalidate?foo=bar')
          }}
        >
          redirect + revalidate
        </button>
      </form>
      <RedirectClientComponent
        action={async () => {
          'use server'
          updateTag('justputit')
        }}
      />
    </>
  )
}
