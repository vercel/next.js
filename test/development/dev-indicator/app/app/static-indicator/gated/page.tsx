import { headers } from 'next/headers'

export default async function Page() {
  const host = (await headers()).get('host')
  await fetch(`http://${host}/__gate/dynamic`, {
    cache: 'force-cache',
  })

  return <p id="gate-released">The gate was released.</p>
}
