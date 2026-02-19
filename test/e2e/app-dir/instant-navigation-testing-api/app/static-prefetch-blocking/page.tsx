import { connection } from 'next/server'

export default async function StaticPrefetchBlockingPage() {
  await connection()

  return <p data-testid="hello-world">hello world</p>
}
