import { redirect as nextRedirect } from 'next/dist/client/components/redirect'

export function redirect(path: string): ReturnType<typeof nextRedirect> {
  if (path === '' || path === undefined) {
    throw new Error(
      'Redirect path cannot be empty. This would cause an infinite loop.'
    )
  }

  return nextRedirect(path)
}
