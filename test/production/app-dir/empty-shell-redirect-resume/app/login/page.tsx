import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export default async function LoginPage() {
  const session = (await cookies()).get('session')

  if (session) {
    redirect('/search')
  }

  return <form id="login">Log in</form>
}
