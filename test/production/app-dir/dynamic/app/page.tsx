import { cookies } from 'next/headers'
export default function Page() {
  return <p>{cookies().get('foo')?.value}</p>
}

export const dynamic = 'error'
