import { connection } from 'next/server'

export default async function SidebarDefault() {
  await connection()

  return <p id="sidebar-marker">sidebar-initial</p>
}
