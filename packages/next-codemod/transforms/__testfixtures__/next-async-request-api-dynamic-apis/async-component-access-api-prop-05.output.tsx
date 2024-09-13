import { use } from "react";
import { draftMode } from 'next/headers'

export function MyComponent2() {
  draftMode().enable()
}

export function useDraftModeEnabled() {
  use(draftMode()).enable()
}
