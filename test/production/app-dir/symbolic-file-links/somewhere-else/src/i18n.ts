import { cookies, type UnsafeUnwrappedCookies } from 'next/headers'

// The purpose of this file is to demonstrate that without proper symbolic file checking
// next accidentally marks files in the root of the project as client files.
export default function () {
  const locale =
    (cookies() as unknown as UnsafeUnwrappedCookies).get('locale')?.value ??
    'en'

  return {
    locale,
  }
}
