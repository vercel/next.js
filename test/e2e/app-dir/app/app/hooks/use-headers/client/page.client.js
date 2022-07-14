import { useHeaders } from 'next/dist/client/components/hooks-server'

export default function Page() {
  // This should throw an error.
  useHeaders()

  return null
}
