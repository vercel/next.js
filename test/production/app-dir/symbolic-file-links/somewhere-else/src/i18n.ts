import { cookies } from 'next/headers'

// The purpose of this file is to demonstrate that without proper symbolic file checking
// next accidentally marks files in the root of the project as client files.
export default async function () {
  const locale = (await cookies()).get('locale')?.value ?? 'en'

  return {
    locale,
  }
}
