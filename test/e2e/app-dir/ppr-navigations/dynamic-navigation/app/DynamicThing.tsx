import { cookies } from 'next/headers'

export function DynamicThing() {
  cookies()
  return <div>Dynamic Thing</div>
}
