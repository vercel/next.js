import { connection } from 'next/server'

export default async function InternalDesignPage() {
  await connection()
  return <div>hi</div>
}
