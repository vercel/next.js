import { useParams } from 'next/dist/client/components/hooks-client'

export default function Page() {
  // This should throw an error.
  useParams()

  return null
}
