import { use } from "react";
import { draftMode, type DangerouslyUnwrapDraftMode } from 'next/headers';

export function MyComponent2() {
  (draftMode() as unknown as DangerouslyUnwrapDraftMode).enable()
}

export function useDraftModeEnabled() {
  use(draftMode()).enable()
}
