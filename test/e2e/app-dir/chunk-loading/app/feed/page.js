import { ClientDynamicShared } from './ClientShared'

export default function FeedPage() {
  return (
    <main>
      <h2>Feed Page</h2>
      <p>Welcome to your feed page.</p>
      <section>
        <ClientDynamicShared />
      </section>
    </main>
  )
}
