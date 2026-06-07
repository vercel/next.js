import { connection } from 'next/server'

export default async function SidebarPage() {
  await connection()

  return <p id="sidebar-marker">sidebar-initial</p>
}
