import { connection } from 'next/server' // eslint-disable-line @typescript-eslint/no-unused-vars
import { ActionButton } from './action-button'

export default async function Page() {
  // await connection()
  return (
    <>
      <p>This is a static app router page.</p>
      <ActionButton />
    </>
  )
}
