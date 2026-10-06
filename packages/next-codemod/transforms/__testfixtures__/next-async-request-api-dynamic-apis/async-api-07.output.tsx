// Already imported the type
import { draftMode, type UnsafeUnwrappedDraftMode } from 'next/headers'

export function MyComponent2() {
  (/* @next-codemod-error Await this API and update its callers; remove the temporary UnsafeUnwrappedDraftMode cast after repairing the migration. */
  draftMode() as unknown as UnsafeUnwrappedDraftMode).enable()
}
