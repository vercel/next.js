import { AccountPanel } from './AccountPanel'
import { getCurrentAccount } from '@/lib/accounts'

export default async function Page() {
  const account = await getCurrentAccount()

  return (
    <main>
      <h1>Your account</h1>
      <AccountPanel account={account} />
    </main>
  )
}
