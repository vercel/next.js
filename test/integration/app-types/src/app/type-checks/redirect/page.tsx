import { redirect, permanentRedirect } from 'next/navigation'
import type { Route } from 'next'

export default function Page() {
  function testRedirect() {
    // Invalid routes - these should cause type errors:
    redirect('/wrong-link')
    redirect('/blog/a?1/b')
    redirect(`/blog/${'a/b/c'}`)
    permanentRedirect('/nonexistent-route')
    permanentRedirect('/wrong/route')

    // Correctly typed - these should pass:
    redirect('/dashboard/another')
    redirect('/about')
    redirect('/redirect')
    redirect(`/blog/${'a/b'}`)
    redirect('https://vercel.com')
    redirect('/invalid' as Route)
    permanentRedirect('/dashboard/user')
    permanentRedirect('/blog/a/b')
    permanentRedirect(`/dashboard/${'123'}`)
    permanentRedirect('/external' as Route)
  }

  return <div onClick={testRedirect} />
}
