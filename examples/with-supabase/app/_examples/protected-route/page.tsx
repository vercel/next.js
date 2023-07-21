// TODO: Duplicate or move this file outside the `_examples` folder to make it a route

import {
  createServerActionClient,
  createServerComponentClient,
} from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import Image from 'next/image'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function ProtectedRoute() {
  const supabase = createServerComponentClient({ cookies })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // This route can only be accessed by authenticated users.
    // Unauthenticated users will be redirected to the `/login` route.
    redirect('/login')
  }

  const signOut = async () => {
    'use server'
    const supabase = createServerActionClient({ cookies })
    await supabase.auth.signOut()
    redirect('/login')
  }

  return (
    <div className="flex-1 flex flex-col max-w-3xl mt-24">
      <h1 className="text-2xl mb-2 flex justify-between">
        <span className="sr-only">Supabase and Next.js Starter Template</span>
      </h1>

      <div className="flex border-b py-3 text-sm text-neutral-100">
        <div className="flex items-center justify-between w-full">
          <code className="bg-neutral-700 px-3 py-1 rounded-lg text-sm">
            Protected page
          </code>
          <span className="flex gap-4">
            Hey, {user.email}! <span className="border-r"></span>{' '}
            <form action={signOut}>
              <button className="text-neutral-100">Logout</button>
            </form>
          </span>
        </div>
      </div>

      <div className="flex gap-8 justify-center mt-12">
        <Image
          src="/supabase.svg"
          alt="Supabase Logo"
          width={225}
          height={45}
          priority
        />
        <div className="border-l rotate-45 h-10"></div>
        <Image
          src="/next.svg"
          alt="Vercel Logo"
          width={150}
          height={36}
          priority
        />
      </div>

      <p className="text-3xl mx-auto max-w-2xl text-center mt-8 text-white">
        The fastest way to get started building apps with{' '}
        <strong>Supabase</strong> and <strong>Next.js</strong>
      </p>

      <div className="flex justify-center mt-12">
        <span className="bg-neutral-100 py-3 px-6 rounded-lg font-mono text-sm text-neutral-900">
          Get started by editing <strong>app/page.tsx</strong>
        </span>
      </div>
    </div>
  )
}
