import { cookies } from 'next/headers'

export function readViewer() {
  return cookies().get('viewer')?.value ?? 'Guest'
}
