import { connection } from 'next/server'

export const instant = false

export default async function Page() {
  await connection()
  return <div id="empty-shell-content">empty shell content</div>
}

export async function generateMetadata() {
  await connection()
  return {
    title: 'dynamic-metadata - empty',
  }
}
