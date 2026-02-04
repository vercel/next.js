// If it's sync default export, convert to async and await the function call
import { draftMode } from 'next/headers'

export default async function MyComponent() {
  (await draftMode()).enable()
}
