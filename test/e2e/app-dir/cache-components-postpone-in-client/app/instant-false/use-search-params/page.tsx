import { ClientSearch } from './client'

export default async function Page() {
  return (
    <main>
      <p>This page suspends on search params in a client component.</p>
      <ClientSearch />
    </main>
  )
}
