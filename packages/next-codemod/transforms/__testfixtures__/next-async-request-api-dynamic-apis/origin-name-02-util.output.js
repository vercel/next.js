import { cookies } from 'next/headers'

export default function Foo() {
  const name = /* @next-codemod-error Manually await this call and refactor the function to be async */
  cookies().get('name')
  return name
}
