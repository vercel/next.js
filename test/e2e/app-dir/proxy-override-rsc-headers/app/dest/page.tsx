import { headers } from 'next/headers'

export default async function Dest() {
  const stamp = (await headers()).get('x-middleware-stamp')
  return (
    <main>
      <p id="dest">Dest</p>
      <p id="stamp">{stamp}</p>
    </main>
  )
}
