import { redirect } from 'next/navigation'
import { connection } from 'next/server'

export default async function Page() {
  await connection()
  return redirect('/?a=b;c')
}
