import { cookies, headers, draftMode } from 'next/headers'

export async function currentUser() {
  return (await cookies()).get('user')?.value
}

export async function currentReferer() {
  return (await headers()).get('referer')
}

export async function isEditing() {
  return String((await draftMode()).isEnabled)
}
