import { ClientSlug } from './client'

export default async function Page() {
  return (
    <main>
      <p>This page suspends on params in a client component.</p>
      <ClientSlug />
    </main>
  )
}
