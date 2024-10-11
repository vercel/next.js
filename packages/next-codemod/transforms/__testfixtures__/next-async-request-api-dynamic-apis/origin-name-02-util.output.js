import { cookies } from 'next/headers'

export default function Foo() {
  const name = /* Next.js Dynamic Async API Codemod: Manually await this call, if it's a Server Component */
  cookies().get('name')
  return name
}
