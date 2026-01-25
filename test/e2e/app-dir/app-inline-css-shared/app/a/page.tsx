import { connection } from 'next/server'
import './styles.css'

export default async function PageA() {
  await connection()
  return (
    <main className="page-a" id="page-a">
      <p>Page A</p>
    </main>
  )
}
