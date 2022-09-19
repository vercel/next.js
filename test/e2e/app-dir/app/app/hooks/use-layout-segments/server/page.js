import { useLayoutSegments } from 'next/dist/client/components/hooks-client'

export default function Page() {
  // This should throw an error.
  useLayoutSegments()

  return null
}
