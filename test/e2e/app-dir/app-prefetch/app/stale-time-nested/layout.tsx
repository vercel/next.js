export const staleTime = 100 // Outer layout: 100 seconds

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div data-testid="outer-layout">{children}</div>
}
