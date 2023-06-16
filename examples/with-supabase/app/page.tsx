import {
  createServerActionClient,
  createServerComponentClient,
} from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

const resources = [
  {
    title: 'Cookie-based Auth and the Next.js App Router',
    subtitle:
      'This free course by Jon Meyers, shows you how to configure Supabase Auth to use cookies, and steps through some common patterns.',
    url: 'https://youtube.com/playlist?list=PL5S4mPUpp4OtMhpnp93EFSo42iQ40XjbF',
  },
  {
    title: 'Supabase Auth Helpers Docs',
    subtitle:
      'This template has configured Supabase Auth to use cookies for you, but the docs are a great place to learn more.',
    url: 'https://supabase.com/docs/guides/auth/auth-helpers/nextjs',
  },
  {
    title: 'Supabase Next.js App Router Example',
    subtitle:
      'Want to see a code example containing some common patterns with Next.js and Supabase? Check out this repo!',
    url: 'https://github.com/supabase/supabase/tree/master/examples/auth/nextjs',
  },
]

export default async function Index() {
  const supabase = createServerComponentClient({ cookies })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // This is a Protected Route that can only be accessed by authenticated users
  // users who are not signed in will be redirected to the `/login` route
  if (!user) {
    redirect('/login')
  }

  const signOut = async () => {
    'use server'
    const supabase = createServerActionClient({ cookies })
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <div className="flex-1 flex flex-col max-w-3xl mt-72">
      <h1 className="text-2xl mb-2 flex justify-between">
        Hey, {user.email}
        <form action={signOut} className="inline ml-2">
          <button className="text-sm text-gray-400">Logout</button>
        </form>
      </h1>

      <hr />

      <p className="text-gray-300 mt-16 mb-16">
        Here are some helpful resources to get you started! 👇
      </p>

      <div className="flex gap-4 h-60 mb-16">
        {resources.map(({ title, subtitle, url }) => (
          <a
            className="flex-1 border border-gray-400 rounded-md p-6 hover:bg-gray-800"
            href={url}
          >
            <h2 className="font-bold mb-2">{title}</h2>
            <p className="text-sm text-gray-400">{subtitle}</p>
          </a>
        ))}
      </div>

      <p className="text-gray-300 mb-16">
        Ready to build your app? Head over to `app/page.tsx` 👉
      </p>

      <div className="bg-gray-800 rounded-md p-8 text-gray-300">
        <p className="font-semibold mb-2 text-gray-200">
          We have also included examples for creating a Supabase client in:
        </p>
        <ul className="list-disc ml-8">
          <li>Client Components - `app/client-component-example/page.tsx`</li>
          <li>Server Components - `app/server-component-example/page.tsx`</li>
          <li>Server Actions - `app/server-action-example/page.tsx`</li>
          <li>Route Handlers - `app/route-handler-example/route.ts`</li>
          <li>Middleware - `middleware.ts`</li>
        </ul>
      </div>
    </div>
  )
}
