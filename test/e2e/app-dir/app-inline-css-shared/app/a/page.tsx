import { connection } from 'next/server'
import './styles.css'

export default async function PageA() {
  await connection()
  return (
    <main id="page-a" className="p-4">
      <h1 className="text-2xl font-bold text-blue-500">Page A</h1>
      <p className="page-a-custom">This has page-specific CSS</p>
    </main>
  )
}
