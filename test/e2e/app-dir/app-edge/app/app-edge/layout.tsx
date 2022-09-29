'client'

import { useSelectedLayoutSegment } from 'next/dist/client/components/hooks-client'

export default function Layout({ children }: { children: React.ReactNode }) {
  // useSelectedLayoutSegment should not be thrown
  useSelectedLayoutSegment()
  return children
}
