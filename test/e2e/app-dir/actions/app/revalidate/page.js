import {
  //   unstable_cache,
  revalidatePath,
  revalidateTag,
} from 'next/cache'
import { redirect } from 'next/navigation'

import { cookies } from 'next/headers'

export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?page',
    {
      next: { revalidate: 360, tags: ['thankyounext'] },
    }
  ).then((res) => res.text())

  const data2 = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?a=b',
    {
      next: { revalidate: 360, tags: ['thankyounext', 'justputit'] },
    }
  ).then((res) => res.text())

  // TODO: make this work + add test
  //   const cachedData = await unstable_cache(
  //     async () => {
  //       const fetchedRandom = await fetch(
  //         'https://next-data-api-endpoint.vercel.app/api/random'
  //       ).then((res) => res.json())
  //       return {
  //         now: Date.now(),
  //         random: Math.random(),
  //         fetchedRandom,
  //       }
  //     },
  //     ['random'],
  //     {
  //       tags: ['thankyounext'],
  //     }
  //   )()

  return (
    <>
      <p>/revalidate</p>
      <p>
        {' '}
        revalidate (tags: thankyounext): <span id="thankyounext">{data}</span>
      </p>
      <p>
        revalidate (tags: thankyounext, justputit):{' '}
        <span id="justputit">{data2}</span>
      </p>
      <p>
        random cookie:{' '}
        <span id="random-cookie">
          {JSON.stringify(cookies().get('random'))}
        </span>
      </p>
      <form>
        <button
          id="set-cookie"
          formAction={async () => {
            'use server'
            cookies().set('random', `${Math.random()}`)
          }}
        >
          set cookie
        </button>
      </form>
      {/* <p>revalidate 10 (tags: thankyounext): {JSON.stringify(cachedData)}</p> */}
      <form>
        <button
          id="revalidate-thankyounext"
          formAction={async () => {
            'use server'
            revalidateTag('thankyounext')
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
            revalidateTag('justputit')
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
            revalidateTag('justputit')
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
    </>
  )
}
