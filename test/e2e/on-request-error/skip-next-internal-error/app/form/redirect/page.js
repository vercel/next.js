import { connection } from 'next/server'
import { redirectAction } from '../action'

export default async function Page() {
  await connection()
  return (
    <form action={redirectAction}>
      <input type="hidden" name="payload" value={'payload-value'} />
      <button type="submit">submit</button>
    </form>
  )
}
