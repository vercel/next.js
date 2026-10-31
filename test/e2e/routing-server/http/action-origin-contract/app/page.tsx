import { cookies } from 'next/headers'
import { invoke } from './actions'

export default async function Page() {
  return (
    <main>
      <form action={invoke}>
        <input name="nonce" defaultValue="" />
        <button type="submit">Invoke action</button>
      </form>
      <output>
        {(await cookies()).get('origin-result')?.value || 'not invoked'}
      </output>
    </main>
  )
}
