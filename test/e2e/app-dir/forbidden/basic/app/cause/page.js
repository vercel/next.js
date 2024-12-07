import { redirect } from 'next/navigation'
import { SessionExpiredError, verifyAuth } from './utils'

export default async function Page() {
  try {
    await verifyAuth()
  } catch (err) {
    if (err.cause instanceof SessionExpiredError) {
      redirect('/')
    }

    throw err
  }

  return <p id="page">Cause Page</p>
}
