import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default function LoginPage() {
  async function signIn(formData: FormData) {
    'use server'
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (!error) {
      redirect('/dashboard')
    }
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui', maxWidth: 400 }}>
      <h1>Sign In</h1>
      <form action={signIn} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <input name="email" type="email" placeholder="Email" required
          style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4 }} />
        <input name="password" type="password" placeholder="Password" required
          style={{ padding: '0.5rem', border: '1px solid #ccc', borderRadius: 4 }} />
        <button type="submit"
          style={{ padding: '0.5rem', background: '#333', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
          Sign In
        </button>
      </form>
    </main>
  )
}
