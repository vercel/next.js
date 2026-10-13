// A shared module outside `appDir` that a Client Component imports.
import { cookies } from 'next/headers'

export function getTheme() {
  return cookies().get('theme')
}
