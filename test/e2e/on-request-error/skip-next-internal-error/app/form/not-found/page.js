import { connection } from 'next/server'
import { notFoundAction } from '../action'

export default async function Page() {
  await connection()
  return (
    <form action={notFoundAction}>
      <input type="hidden" name="payload" value={'payload-value'} />
      <button type="submit">submit</button>
    </form>
  )
}
