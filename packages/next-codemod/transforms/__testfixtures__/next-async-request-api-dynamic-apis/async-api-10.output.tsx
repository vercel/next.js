import { headers, type UnsafeUnwrappedHeaders } from 'next/headers';

export function MyComp() {
  return (/* @next-codemod-error Await this API and update its callers; remove the temporary UnsafeUnwrappedHeaders cast after repairing the migration. */
  headers() as unknown as UnsafeUnwrappedHeaders);
}

export function MyComp2() {
  return (/* @next-codemod-error Await this API and update its callers; remove the temporary UnsafeUnwrappedHeaders cast after repairing the migration. */
  headers() as unknown as UnsafeUnwrappedHeaders);
}

export function MyComp3() {
  return (/* @next-codemod-error Await this API and update its callers; remove the temporary UnsafeUnwrappedHeaders cast after repairing the migration. */
  headers() as unknown as UnsafeUnwrappedHeaders);
}
