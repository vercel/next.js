import { Counter } from './Counter'
import { ClientShared, ClientDynamicShared } from './ClientShared'

export default function AccountPage() {
  return (
    <main>
      <h2>Account Page</h2>
      <p>
        Welcome to your account page. Here you can increment your account
        counter
      </p>
      <section>
        <Counter />
      </section>
      <section>
        <ClientShared />
      </section>
      <section>
        <ClientDynamicShared />
      </section>
    </main>
  )
}
