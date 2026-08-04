import { LayoutSentinel } from '../getSentinelValue'

export const dynamic = 'force-static'

export default function ForceStaticLayout({ children }) {
  return (
    <div>
      <LayoutSentinel />
      {children}
    </div>
  )
}
