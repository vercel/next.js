export const staleTime = 200 // Inner layout: 200 seconds (overrides outer layout's 100)

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div data-testid="inner-layout">{children}</div>
}
