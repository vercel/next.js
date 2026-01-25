import { connection } from 'next/server'
import './styles.css'

export default async function PageB() {
  await connection()
  return (
    <main id="page-b" className="p-4">
      <h1 className="text-2xl font-bold text-blue-500">Page B</h1>
      <p className="page-b-custom">This has page B specific CSS</p>
    </main>
  )
}
