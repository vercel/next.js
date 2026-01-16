export const unstable_staleTime = 200 // 200 seconds (overrides parent's 100)

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
