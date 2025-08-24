// Already imported the type
import { draftMode, type UnsafeUnwrappedDraftMode } from 'next/headers'

export function MyComponent2() {
  draftMode().enable()
}
