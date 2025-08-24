import { draftMode } from 'next/headers'

export default async function MyComponent() {
  draftMode().enable()
}

export async function MyComponent2() {
  draftMode().enable()
}
