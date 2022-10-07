'client'

import { previewData } from 'next/dist/client/components/hooks-server'

export default function Page() {
  // This should throw an error.
  previewData()

  return null
}
