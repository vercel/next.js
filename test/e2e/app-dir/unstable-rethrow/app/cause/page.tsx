import { cookies } from 'next/headers'
import { unstable_rethrow } from 'next/navigation'

function someFunction() {
  try {
    cookies()
  } catch (err) {
    throw new Error('Oopsy', { cause: err })
  }
}

export default async function Page() {
  try {
    someFunction()
  } catch (err) {
    console.log('[test assertion]: checking error')
    unstable_rethrow(err)
    console.error('[test assertion]: error leaked', err)
  }

  return <p>hello world</p>
}
