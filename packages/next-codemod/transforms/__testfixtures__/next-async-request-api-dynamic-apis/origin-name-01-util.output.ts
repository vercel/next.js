import { cookies, type UnsafeUnwrappedCookies } from 'next/headers';

export default function Foo(): string {
  const name = (/* @next-codemod-error Await this API and update its callers; remove the temporary UnsafeUnwrappedCookies cast after repairing the migration. */
  cookies() as unknown as UnsafeUnwrappedCookies).get('name')
  return name
}
