import { after, connection } from 'next/server'
import { setTimeout } from 'timers/promises'

export default async function Page() {
  await connection()
  after(async () => {
    console.log('[after] starting sleep')
    await setTimeout(2500)

    // make sure that spawning more after tasks works
    after(async () => {
      await setTimeout(2500)
      console.log('[after] finished sleep')
    })
  })
  return <>Hello</>
}
