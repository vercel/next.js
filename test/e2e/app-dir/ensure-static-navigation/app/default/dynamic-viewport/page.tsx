import type { Viewport } from 'next'
import { connection } from 'next/server'

export const ensureStatic = 'navigation'

export async function generateViewport(): Promise<Viewport> {
  await connection()
  return {
    themeColor: '#d692b7',
  }
}

export default function Page() {
  return (
    <main>
      <p>This page has a dynamic generteViewport</p>
    </main>
  )
}
