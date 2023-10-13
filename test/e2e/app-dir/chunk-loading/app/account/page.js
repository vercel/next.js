import { ClientShared, ClientDynamicShared } from './ClientShared'

import styles from './styles.module.css'

export default function AccountPage() {
  return (
    <main className={styles.blue}>
      <h2>Account Page</h2>
      <p>
        Welcome to your account page. Here you can increment your account
        counter
      </p>
      <section>
        <ClientShared />
      </section>
      <section>
        <ClientDynamicShared />
      </section>
    </main>
  )
}
