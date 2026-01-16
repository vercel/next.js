export const unstable_staleTime = 180 // 3 minutes - will be overridden by page

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
