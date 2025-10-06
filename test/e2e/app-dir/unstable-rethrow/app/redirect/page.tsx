import { redirect, unstable_rethrow } from 'next/navigation'

export default function Page() {
  try {
    redirect('/')
  } catch (err) {
    console.log('[test assertion]: checking error')
    unstable_rethrow(err)
    console.error('[test assertion]: error leaked', err)
  }
}
