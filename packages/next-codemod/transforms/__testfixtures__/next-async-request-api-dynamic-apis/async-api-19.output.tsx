import { cookies, headers, type UnsafeUnwrappedHeaders } from 'next/headers';

export function myFun() {
  return async function () {
    (await cookies()).get('name')
  };
}

export function myFun2() {
  return function () {
    void (/* @next-codemod-error Await this API and update its callers; remove the temporary UnsafeUnwrappedHeaders cast after repairing the migration. */
    headers() as unknown as UnsafeUnwrappedHeaders)
  };
}
