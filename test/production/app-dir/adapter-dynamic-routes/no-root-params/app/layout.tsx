// The root layout is not inside a dynamic segment, so `team` and `locale` are
// ordinary dynamic params and not root params.
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
