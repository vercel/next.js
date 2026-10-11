import { headers, type UnsafeUnwrappedHeaders } from 'next/headers';

export function MyComp() {
  void (/* @next-codemod-error Await this API and update its callers; remove the temporary UnsafeUnwrappedHeaders cast after repairing the migration. */
  headers() as unknown as UnsafeUnwrappedHeaders)
}

export function generateContentfulMetadata() {
  void (/* @next-codemod-error Await this API and update its callers; remove the temporary UnsafeUnwrappedHeaders cast after repairing the migration. */
  headers() as unknown as UnsafeUnwrappedHeaders)
}

