import { HydrationTest } from '../hydration-test'

export default function HydrationTestLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div>
      <HydrationTest />
      {children}
    </div>
  )
}
