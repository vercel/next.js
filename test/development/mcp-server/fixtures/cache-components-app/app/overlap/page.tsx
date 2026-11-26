import { headers } from 'next/headers'

export default async function Page() {
  if ((await headers()).get('cache-control') === 'no-cache') {
    return <p>Bypassed</p>
  }
  await fetch(process.env.TEST_GATE_URL!, { cache: 'no-store' })
  return <p>Checked</p>
}
