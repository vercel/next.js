import { use } from "react";
import { draftMode, type UnsafeUnwrappedDraftMode } from 'next/headers';

export function MyComponent2() {
  (draftMode() as unknown as UnsafeUnwrappedDraftMode).enable()
}

export function useDraftModeEnabled() {
  use(draftMode()).enable()
}
