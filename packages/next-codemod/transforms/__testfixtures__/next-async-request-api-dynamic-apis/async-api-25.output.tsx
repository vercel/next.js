import { cookies, type UnsafeUnwrappedCookies } from 'next/headers';

export function myFunc() {
  const c = (/* @next-codemod-error Await this API and update its callers; remove the temporary UnsafeUnwrappedCookies cast after repairing the migration. */
  cookies() as unknown as UnsafeUnwrappedCookies)
  void (/* @next-codemod-error Await this API and update its callers; remove the temporary UnsafeUnwrappedCookies cast after repairing the migration. */
  cookies() as unknown as UnsafeUnwrappedCookies)
}
