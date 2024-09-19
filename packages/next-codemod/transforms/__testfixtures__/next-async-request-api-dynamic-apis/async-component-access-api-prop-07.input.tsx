import { draftMode, type DangerouslyUnwrapDraftMode } from 'next/headers';

export function MyComponent2() {
  draftMode().enable()
}

