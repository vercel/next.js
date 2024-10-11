import { cookies } from 'next/headers'

export default function Foo() {
  const name = /* @next-codemod-error Manually await this call, if it's a Server Component */
  cookies().get('name')
  return name
}
