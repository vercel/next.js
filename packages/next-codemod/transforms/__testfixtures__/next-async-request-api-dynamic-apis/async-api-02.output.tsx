import { draftMode } from 'next/headers'

export async function MyComponent() {
  (await draftMode()).enable()
}
