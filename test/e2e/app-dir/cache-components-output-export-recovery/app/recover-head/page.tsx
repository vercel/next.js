import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'

export const instant = false
export const metadata = { title: 'Original metadata' }

export async function generateViewport() {
  const themeColor =
    (await cookies()).get('cc-output-export-recovery-theme')?.value ?? '#a1b2c3'
  return { themeColor }
}

export default function Page() {
  notFound()
}
