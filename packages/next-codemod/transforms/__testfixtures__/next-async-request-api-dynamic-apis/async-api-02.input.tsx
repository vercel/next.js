import { draftMode } from 'next/headers'

export async function MyComponent() {
  draftMode().enable()
}
