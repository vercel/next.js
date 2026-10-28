export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1> intercepted layout</h1>
      {children}
    </>
  )
}
